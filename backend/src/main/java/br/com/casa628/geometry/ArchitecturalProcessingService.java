package br.com.casa628.geometry;

import br.com.casa628.geometry.WallFaceDetector.Face;
import br.com.casa628.geometry.WallFaceDetector.Wall;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.io.WKTReader;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
public class ArchitecturalProcessingService {
    private record PathShape(String id, String layer, String candidate, Geometry geometry) {}
    private record Label(String id, String text, Point point) {}
    private record Measure(String id, String code, double value, String textId, String text) {}
    private record Opening(String id, List<String> pathIds, List<String> textIds, List<String> measureIds,
                           String wallId, String type, String status, Point center, Double position,
                           Double width, Double height, Double sill, String annotationId, String subtype,
                           Double transomHeight, LineString span) {
        Opening(String id, List<String> pathIds, List<String> textIds, List<String> measureIds,
                String wallId, String type, String status, Point center, Double position,
                Double width, Double height, Double sill) {
            this(id, pathIds, textIds, measureIds, wallId, type, status, center, position,
                    width, height, sill, null, null, null, null);
        }
    }
    private record Semantic(String id, String elementType, JsonNode data, Point anchor) {}
    private record BoundarySpan(LineString geometry, List<String> sourcePathIds) {}

    private final JdbcTemplate jdbc;
    private final JsonMapper mapper;
    private final GeometryFactory geometryFactory = new GeometryFactory();
    private final WallFaceDetector wallDetector;
    private final double annotationDistance, wallAssociationDistance;

    public ArchitecturalProcessingService(JdbcTemplate jdbc, JsonMapper mapper,
            @Value("${house.wall.min-length:0.5}") double minLength,
            @Value("${house.wall.min-thickness:0.08}") double minThickness,
            @Value("${house.wall.max-thickness:0.35}") double maxThickness,
            @Value("${house.wall.angle-degrees:3}") double angle,
            @Value("${house.wall.min-overlap-ratio:0.8}") double overlap,
            @Value("${house.wall.endpoint-tolerance:0.45}") double endpointTolerance,
            @Value("${house.wall.corner-snap:0.15}") double cornerSnap,
            @Value("${house.opening.annotation-distance:0.75}") double annotationDistance,
            @Value("${house.opening.wall-distance:0.3}") double wallAssociationDistance) {
        this.jdbc = jdbc; this.mapper = mapper;
        this.wallDetector = new WallFaceDetector(minLength, minThickness, maxThickness, angle, overlap, endpointTolerance, cornerSnap);
        this.annotationDistance = annotationDistance; this.wallAssociationDistance = wallAssociationDistance;
    }

    public void rebuild(String projectId) {
        jdbc.update("DELETE FROM house_derived_room_marker WHERE project_id=?", projectId);
        jdbc.update("DELETE FROM house_derived_opening WHERE project_id=?", projectId);
        jdbc.update("DELETE FROM house_derived_wall WHERE project_id=?", projectId);
        for (LayoutMode mode : LayoutMode.values()) {
            List<PathShape> paths = loadPaths(projectId, mode);
            List<Label> labels = loadLabels(projectId, mode);
            Map<String, String> roomTypes = loadRoomTypes(projectId);
            for (Label label : labels) {
                if (label.point == null || !label.text.matches("[1-6]")) continue;
                jdbc.update("INSERT INTO house_derived_room_marker(project_id,layout_mode,id,label,source_text_id,center,status,room_type) VALUES (?,?,?,?,?,ST_GeomFromText(?,0),?,?)",
                        projectId, mode.name(), stableId(mode + ":room-marker:" + label.id), label.text,
                        label.id, label.point.toText(), "REFERENCE_MARKER", roomTypes.getOrDefault(label.text, "UNKNOWN"));
            }
            List<Measure> measures = loadMeasures(projectId, labels);
            List<Face> faces = new ArrayList<>();
            for (PathShape path : paths) {
                if (!"wall_candidate".equals(path.candidate) || !path.layer.startsWith("ARQ-ALV") || path.geometry == null) continue;
                for (LineString line : lines(path.geometry)) {
                    Coordinate[] points = line.getCoordinates();
                    for (int i = 1; i < points.length; i++)
                        if (points[i - 1].distance(points[i]) > 0) faces.add(new Face(path.id, path.layer, points[i - 1], points[i]));
                }
            }
            List<Wall> walls = new ArrayList<>(wallDetector.detect(faces, mode));
            List<Opening> openings = new ArrayList<>(openings(paths, labels, measures, walls, mode));
            bridgeDocumentedWindows(walls, openings, mode);
            applySemanticAnnotations(projectId, mode, paths, walls, openings);
            for (Wall wall : walls) jdbc.update("INSERT INTO house_derived_wall(project_id,layout_mode,id,source_path_ids,axis,thickness,height,height_source_id,status) VALUES (?,?,?,?::jsonb,ST_GeomFromText(?,0),?,NULL,NULL,?)",
                    projectId, mode.name(), wall.id(), json(wall.sourcePathIds()), wall.axis().toText(), wall.thickness(),
                    openings.stream().anyMatch(o -> wall.id().equals(o.wallId)) ? "FACE_PAIR_WITH_OPENING" : "FACE_PAIR");
            for (Opening opening : openings)
                jdbc.update("INSERT INTO house_derived_opening(project_id,layout_mode,id,source_path_ids,source_text_ids,measurement_ids,wall_id,type,status,center,position_along_wall,width,height,sill_height,annotation_id,subtype,transom_height,span) VALUES (?,?,?,?::jsonb,?::jsonb,?::jsonb,?,?,?,ST_GeomFromText(?,0),?,?,?,?,?,?,?,ST_GeomFromText(?,0))",
                        projectId, mode.name(), opening.id, json(opening.pathIds), json(opening.textIds), json(opening.measureIds),
                        opening.wallId, opening.type, opening.status, opening.center.toText(), opening.position,
                        opening.width, opening.height, opening.sill, opening.annotationId, opening.subtype,
                        opening.transomHeight, opening.span == null ? null : opening.span.toText());
        }
    }

    /** A labelled window may bridge a real gap between aligned paired-face walls. */
    private void bridgeDocumentedWindows(List<Wall> walls, List<Opening> openings, LayoutMode mode) {
        for (int index = 0; index < openings.size(); index++) {
            Opening opening = openings.get(index);
            if (!opening.type.equals("WINDOW") || opening.width == null || opening.height == null ||
                    opening.sill == null || opening.pathIds.isEmpty() || opening.wallId != null) continue;
            Wall before = null, after = null;
            Coordinate from = null, to = null;
            double best = Double.POSITIVE_INFINITY;
            for (Wall a : walls) for (Wall b : walls) {
                if (a == b || Math.abs(a.thickness() - b.thickness()) > 0.035 || angle(a.axis(), b.axis()) > Math.toRadians(3)) continue;
                Coordinate[] aa = a.axis().getCoordinates(), bb = b.axis().getCoordinates();
                Coordinate direction = new Coordinate((aa[1].x-aa[0].x)/a.axis().getLength(),
                        (aa[1].y-aa[0].y)/a.axis().getLength());
                if ((bb[1].x-bb[0].x)*direction.x+(bb[1].y-bb[0].y)*direction.y < 0)
                    bb = new Coordinate[] {bb[1], bb[0]};
                double separation = Math.abs((bb[0].x-aa[0].x)*direction.y-(bb[0].y-aa[0].y)*direction.x);
                if (separation > 0.045) continue;
                double gap = (bb[0].x-aa[1].x)*direction.x+(bb[0].y-aa[1].y)*direction.y;
                if (gap < 0.3 || gap > 3.5 || Math.abs(gap-opening.width) > 0.13) continue;
                Coordinate middle = new Coordinate((aa[1].x+bb[0].x)/2, (aa[1].y+bb[0].y)/2);
                double midpointDistance = middle.distance(opening.center.getCoordinate());
                if (midpointDistance > 0.22 || midpointDistance >= best) continue;
                before = a; after = b; from = aa[0]; to = bb[1]; best = midpointDistance;
            }
            if (before == null) continue;
            Set<String> sources = new HashSet<>(before.sourcePathIds());
            sources.addAll(after.sourcePathIds());
            List<String> ids = sources.stream().sorted().toList();
            String id = stableId(mode + ":bridge:" + ids + ":" + opening.id);
            Wall merged = new Wall(id, geometryFactory.createLineString(new Coordinate[] {from, to}),
                    (before.thickness()+after.thickness())/2, ids);
            walls.remove(before); walls.remove(after); walls.add(merged);
            for (int i = 0; i < openings.size(); i++) {
                Opening old = openings.get(i);
                if (i == index || before.id().equals(old.wallId) || after.id().equals(old.wallId))
                    openings.set(i, withWall(old, merged));
            }
        }
    }

    private static Opening withWall(Opening opening, Wall wall) {
        return new Opening(opening.id, opening.pathIds, opening.textIds, opening.measureIds, wall.id(),
                opening.type, opening.status.startsWith("ASSOCIATED") ? opening.status : "ASSOCIATED",
                opening.center, position(opening.center, wall.axis()),
                opening.width, opening.height, opening.sill, opening.annotationId, opening.subtype,
                opening.transomHeight, opening.span);
    }

    private Map<String, String> loadRoomTypes(String projectId) {
        Map<String, String> result = new HashMap<>();
        jdbc.query("SELECT original_json::text FROM house_semantic_item WHERE project_id=? AND kind='ROOM_MARKER'",
                rs -> {
                    JsonNode item = mapper.readTree(rs.getString(1));
                    result.put(item.path("room_number").asText(), item.path("room_type").asText("UNKNOWN"));
                }, projectId);
        return result;
    }

    private List<Semantic> loadSemantics(String projectId, LayoutMode mode, String kind) {
        String column = mode == LayoutMode.ORIGINAL_LAYOUT ? "geom_original" : "geom";
        return jdbc.query("SELECT source_id,original_json::text,ST_AsText(" + column + ") FROM house_semantic_item WHERE project_id=? AND kind=? ORDER BY source_id",
                (rs, row) -> {
                    JsonNode data = mapper.readTree(rs.getString(2));
                    Geometry geometry = parse(rs.getString(3));
                    return new Semantic(rs.getString(1), data.path("element_type").asText(""), data,
                            geometry instanceof Point point ? point : null);
                }, projectId, kind);
    }

    private void applySemanticAnnotations(String projectId, LayoutMode mode, List<PathShape> paths,
                                          List<Wall> walls, List<Opening> openings) {
        for (Semantic semantic : loadSemantics(projectId, mode, "ANNOTATION")) {
            String type = semantic.elementType.contains("WINDOW") ? "WINDOW" :
                    semantic.elementType.contains("GATE") ? "GATE" :
                    semantic.elementType.contains("DOOR") ? "DOOR" : null;
            if (type == null || semantic.anchor == null) continue;
            List<String> textIds = strings(semantic.data.path("source_text_ids"));
            List<String> measureIds = new ArrayList<>();
            Double height = null, sill = null, transom = null;
            for (JsonNode dimension : semantic.data.path("dimensions")) {
                String code = dimension.path("code").asText("").toUpperCase();
                double value = dimension.path("value_m").asDouble(0);
                if (value <= 0 || value > 4) continue;
                if ("H".equals(code)) {
                    if (height == null) height = value;
                    else transom = value;
                    measureIds.add(dimension.path("measurement_id").asText());
                } else if ("PD".equals(code) && "WINDOW".equals(type)) {
                    sill = value;
                    measureIds.add(dimension.path("measurement_id").asText());
                }
            }
            int match = -1;
            for (int i = 0; i < openings.size(); i++) {
                if (openings.get(i).textIds.stream().anyMatch(textIds::contains)) { match = i; break; }
            }
            Opening old = match < 0 ? null : openings.get(match);
            Opening updated = new Opening(old == null ? stableId(mode + ":annotation:" + semantic.id) : old.id,
                    old == null ? List.of() : old.pathIds, textIds, measureIds,
                    old == null ? null : old.wallId, type, old == null ? "ANNOTATION_ONLY" : old.status,
                    old == null || "GATE".equals(type) ? semantic.anchor : old.center,
                    old == null || "GATE".equals(type) ? null : old.position,
                    old == null ? null : old.width, height, sill, semantic.id,
                    semantic.elementType, transom, old == null ? null : old.span);
            if (match < 0) openings.add(updated); else openings.set(match, updated);
        }
        for (Semantic evidence : loadSemantics(projectId, mode, "USER_EVIDENCE")) {
            if (!"OPENING_LOCATION_HINT".equals(evidence.data.path("evidence_type").asText()) ||
                    !"DOOR".equals(evidence.elementType) || evidence.anchor == null) continue;
            openings.add(new Opening(stableId(mode + ":evidence:" + evidence.id), List.of(), List.of(), List.of(),
                    null, "DOOR", "GEOMETRY_CANDIDATE", evidence.anchor, null, null, null, null,
                    evidence.id, "INTERNAL_DOOR", null, null));
        }
        // Label positions and paired-face interruptions support these distinct wall spans.
        for (String id : List.of("ann-015", "ann-016", "ann-017",
                "ann-021", "user-room3-bottom-door", "ann-022"))
            for (int i = 0; i < openings.size(); i++)
                if (id.equals(openings.get(i).annotationId)) {
                    Opening linked = bridgeGap(openings.get(i), walls, openings, mode);
                    if (linked != null) openings.set(i, linked);
                    break;
                }
        attachKitchenDoorLeaf(paths, openings);
        bridgeGeometricDoors(paths, walls, openings, mode);
        for (int i = 0; i < openings.size(); i++) {
            Opening opening = openings.get(i);
            if (opening.annotationId == null || !"GATE".equals(opening.type) || opening.span != null) continue;
            BoundarySpan candidate = "METAL_GATE".equals(opening.subtype)
                    ? findJambSpan(opening, paths, openings) : null;
            if (candidate == null) candidate = findBoundarySpan(opening, paths, openings);
            if (candidate == null) continue;
            LineString span = candidate.geometry;
            openings.set(i, new Opening(opening.id, candidate.sourcePathIds, opening.textIds, opening.measureIds,
                    null, opening.type, "BOUNDARY_SPAN_CANDIDATE", geometryFactory.createPoint(span.getCentroid().getCoordinate()),
                    null, span.getLength(), opening.height, null, opening.annotationId, opening.subtype,
                    null, span));
        }
        for (int i = 0; i < openings.size(); i++) {
            Opening opening = openings.get(i);
            if (opening.span != null || opening.wallId == null || opening.width == null) continue;
            Wall wall = walls.stream().filter(w -> w.id().equals(opening.wallId)).findFirst().orElse(null);
            if (wall == null) continue;
            double station = position(opening.center, wall.axis());
            LineString span = spanOn(wall.axis(), station - opening.width / 2, station + opening.width / 2);
            openings.set(i, new Opening(opening.id, opening.pathIds, opening.textIds, opening.measureIds,
                    opening.wallId, opening.type, opening.status, opening.center, station,
                    opening.width, opening.height, opening.sill, opening.annotationId, opening.subtype,
                    opening.transomHeight, span));
        }
    }

    private Opening bridgeGap(Opening opening, List<Wall> walls, List<Opening> openings, LayoutMode mode) {
        return bridgeGap(opening, walls, openings, mode, null);
    }

    private Opening bridgeGap(Opening opening, List<Wall> walls, List<Opening> openings,
                              LayoutMode mode, PathShape doorLeaf) {
        Wall before = null, after = null;
        Coordinate start = null, end = null, gapStart = null, gapEnd = null;
        double best = Double.POSITIVE_INFINITY;
        for (Wall a : walls) for (Wall b : walls) {
            if (a == b || Math.abs(a.thickness() - b.thickness()) > 0.06 ||
                    angle(a.axis(), b.axis()) > Math.toRadians(3)) continue;
            Coordinate[] aa = a.axis().getCoordinates(), bb = b.axis().getCoordinates();
            double len = a.axis().getLength(), ux = (aa[1].x-aa[0].x)/len, uy = (aa[1].y-aa[0].y)/len;
            if ((bb[1].x-bb[0].x)*ux+(bb[1].y-bb[0].y)*uy < 0)
                bb = new Coordinate[] {bb[1], bb[0]};
            double separation = Math.abs((bb[0].x-aa[0].x)*uy-(bb[0].y-aa[0].y)*ux);
            if (separation > 0.07) continue;
            double gap = (bb[0].x-aa[1].x)*ux+(bb[0].y-aa[1].y)*uy;
            if (gap < 0.5 || gap > 2.2) continue;
            if (doorLeaf != null) {
                double major = Math.max(doorLeaf.geometry.getEnvelopeInternal().getWidth(),
                        doorLeaf.geometry.getEnvelopeInternal().getHeight());
                if (gap > 1.3 || Math.abs(gap - major) > 0.12) continue;
                double leafX = doorLeaf.geometry.getEnvelopeInternal().getWidth();
                double leafY = doorLeaf.geometry.getEnvelopeInternal().getHeight();
                if ((leafX > leafY && Math.abs(ux) > 0.2) ||
                        (leafY > leafX && Math.abs(uy) > 0.2)) continue;
                double hingeDistance = Double.POSITIVE_INFINITY;
                for (Coordinate corner : doorLeaf.geometry.getCoordinates())
                    hingeDistance = Math.min(hingeDistance,
                            Math.min(corner.distance(aa[1]), corner.distance(bb[0])));
                if (hingeDistance > 0.15) continue;
            }
            Coordinate middle = new Coordinate((aa[1].x+bb[0].x)/2, (aa[1].y+bb[0].y)/2);
            double distance = middle.distance(opening.center.getCoordinate());
            if (distance > 1.35 || distance >= best) continue;
            before = a; after = b; start = aa[0]; end = bb[1]; gapStart = aa[1]; gapEnd = bb[0]; best = distance;
        }
        if (before == null) return null;
        Set<String> sources = new HashSet<>(before.sourcePathIds());
        sources.addAll(after.sourcePathIds());
        List<String> ids = sources.stream().sorted().toList();
        Wall merged = new Wall(stableId(mode + ":gap:" + ids + ":" + opening.annotationId),
                geometryFactory.createLineString(new Coordinate[] {start, end}),
                (before.thickness()+after.thickness())/2, ids);
        walls.remove(before); walls.remove(after); walls.add(merged);
        for (int i = 0; i < openings.size(); i++) {
            Opening old = openings.get(i);
            if (before.id().equals(old.wallId) || after.id().equals(old.wallId)) openings.set(i, withWall(old, merged));
        }
        LineString span = geometryFactory.createLineString(new Coordinate[] {gapStart, gapEnd});
        Point center = geometryFactory.createPoint(span.getCentroid().getCoordinate());
        Set<String> openingSources = new HashSet<>(ids);
        openingSources.addAll(opening.pathIds);
        return new Opening(opening.id, openingSources.stream().sorted().toList(), opening.textIds, opening.measureIds, merged.id(),
                opening.type, "ASSOCIATED_GAP", center, position(center, merged.axis()), span.getLength(),
                opening.height, opening.sill, opening.annotationId, opening.subtype,
                opening.transomHeight, span);
    }

    private void bridgeGeometricDoors(List<PathShape> paths, List<Wall> walls,
                                      List<Opening> openings, LayoutMode mode) {
        Map<String, PathShape> byId = new HashMap<>();
        for (PathShape path : paths) byId.put(path.id, path);
        for (int i = 0; i < openings.size(); i++) {
            Opening candidate = openings.get(i);
            if (!"UNKNOWN_OPENING".equals(candidate.type) || candidate.pathIds.size() != 1) continue;
            PathShape leaf = byId.get(candidate.pathIds.getFirst());
            if (leaf == null || leaf.geometry == null || !"opening_candidate".equals(leaf.candidate)) continue;
            List<LineString> parts = lines(leaf.geometry);
            if (parts.size() != 1 || parts.getFirst().getNumPoints() != 5 || !parts.getFirst().isClosed()) continue;
            double width = leaf.geometry.getEnvelopeInternal().getWidth();
            double height = leaf.geometry.getEnvelopeInternal().getHeight();
            double major = Math.max(width, height), minor = Math.min(width, height);
            if (major < 0.6 || major > 1.3 || minor > 0.08) continue;
            Opening possibleDoor = new Opening(candidate.id, candidate.pathIds, List.of(), List.of(),
                    null, "DOOR", "GEOMETRY_CANDIDATE", candidate.center, null, major, null, null,
                    "geometry:" + leaf.id, "GEOMETRIC_DOOR", null, null);
            Opening linked = bridgeGap(possibleDoor, walls, openings, mode, leaf);
            if (linked != null) openings.set(i, linked);
        }
    }

    private void attachKitchenDoorLeaf(List<PathShape> paths, List<Opening> openings) {
        for (int i = 0; i < openings.size(); i++) {
            Opening door = openings.get(i);
            if (!"user-room3-bottom-door".equals(door.annotationId) || door.span == null) continue;
            PathShape best = null;
            double bestDistance = 0.2;
            for (PathShape path : paths) {
                if (!"opening_candidate".equals(path.candidate) || path.geometry == null) continue;
                double width = path.geometry.getEnvelopeInternal().getWidth();
                double height = path.geometry.getEnvelopeInternal().getHeight();
                double longSide = Math.max(width, height), shortSide = Math.min(width, height);
                if (longSide < 0.6 || longSide > 1.2 || shortSide > 0.08) continue;
                if (Math.abs(door.span.getCoordinateN(1).x-door.span.getCoordinateN(0).x) >
                        Math.abs(door.span.getCoordinateN(1).y-door.span.getCoordinateN(0).y) && width > height) continue;
                double distance = Math.min(path.geometry.distance(geometryFactory.createPoint(door.span.getCoordinateN(0))),
                        path.geometry.distance(geometryFactory.createPoint(door.span.getCoordinateN(1))));
                if (distance < bestDistance) { best = path; bestDistance = distance; }
            }
            if (best == null) continue;
            String sourceId = best.id;
            List<String> ids = new ArrayList<>(door.pathIds);
            if (!ids.contains(sourceId)) ids.add(sourceId);
            openings.set(i, new Opening(door.id, ids, door.textIds, door.measureIds, door.wallId,
                    door.type, door.status, door.center, door.position, door.width, door.height, door.sill,
                    door.annotationId, door.subtype, door.transomHeight, door.span));
            openings.removeIf(candidate -> "UNKNOWN_OPENING".equals(candidate.type) && candidate.pathIds.contains(sourceId));
            return;
        }
    }

    private BoundarySpan findBoundarySpan(Opening opening, List<PathShape> paths, List<Opening> openings) {
        record Edge(String id, Coordinate start, Coordinate end) {}
        List<Edge> edges = new ArrayList<>();
        for (PathShape path : paths) {
            if (!"wall_candidate".equals(path.candidate) || !path.layer.startsWith("ARQ-ALV") || path.geometry == null) continue;
            for (LineString line : lines(path.geometry)) {
                Coordinate[] points = line.getCoordinates();
                for (int i = 1; i < points.length; i++) {
                    Coordinate a = points[i-1], b = points[i];
                    double length = a.distance(b);
                    if (length < 0.45 || Math.abs(a.y-b.y)/length > 0.08 ||
                            Math.abs((a.y+b.y)/2-opening.center.getY()) > 1.25) continue;
                    edges.add(a.x < b.x ? new Edge(path.id, a, b) : new Edge(path.id, b, a));
                }
            }
        }
        BoundarySpan bestSpan = null;
        double bestScore = Double.POSITIVE_INFINITY;
        for (Edge a : edges) for (Edge b : edges) {
            if (a.id.equals(b.id)) continue;
            double gap = b.start.x-a.end.x;
            if (gap < 0.65 || gap > 3.4 || Math.abs(a.end.y-b.start.y) > 0.22) continue;
            LineString span = geometryFactory.createLineString(new Coordinate[] {a.end, b.start});
            boolean occupied = openings.stream().anyMatch(other -> other != opening &&
                    !"GATE".equals(other.type) && other.span != null &&
                    span.distance(other.span) < 0.16 &&
                    span.intersection(other.span.buffer(0.16)).getLength() > 0.3);
            occupied |= annotatedWindowOccupies(span, openings);
            if (occupied) continue;
            double score = span.getCentroid().distance(opening.center) +
                    Math.abs(span.getCentroid().getY()-opening.center.getY()) * 0.4;
            if (score > 3.0 || score >= bestScore) continue;
            bestSpan = new BoundarySpan(span, List.of(a.id, b.id)); bestScore = score;
        }
        return bestSpan;
    }

    /** Short, aligned masonry returns on either side of a gate are its jambs. */
    private BoundarySpan findJambSpan(Opening opening, List<PathShape> paths, List<Opening> openings) {
        record Jamb(String id, Coordinate top, Coordinate bottom) {}
        List<Jamb> jambs = new ArrayList<>();
        List<LineString> masonry = new ArrayList<>();
        for (PathShape path : paths) {
            if (!"wall_candidate".equals(path.candidate) || !path.layer.startsWith("ARQ-ALV") || path.geometry == null) continue;
            for (LineString line : lines(path.geometry)) {
                Coordinate[] points = line.getCoordinates();
                for (int i = 1; i < points.length; i++) {
                    Coordinate a = points[i - 1], b = points[i];
                    double length = a.distance(b);
                    if (length < 0.001) continue;
                    if (Math.abs(a.y - b.y) / length < 0.08 && length > 0.25)
                        masonry.add(geometryFactory.createLineString(new Coordinate[] {a, b}));
                    if (Math.abs(a.x - b.x) / length > 0.08 || length < 0.07 || length > 0.4) continue;
                    jambs.add(new Jamb(path.id, a.y < b.y ? a : b, a.y < b.y ? b : a));
                }
            }
        }
        BoundarySpan best = null;
        double bestScore = Double.POSITIVE_INFINITY;
        for (Jamb left : jambs) for (Jamb right : jambs) {
            if (left.id.equals(right.id)) continue;
            double width = right.top.x - left.top.x;
            if (width < 0.65 || width > 3.4 || Math.abs(left.top.y - right.top.y) > 0.08 ||
                    Math.abs(left.bottom.y - right.bottom.y) > 0.25) continue;
            LineString span = geometryFactory.createLineString(new Coordinate[] {left.top, right.top});
            if (span.getCentroid().distance(opening.center) > 3.0) continue;
            boolean blocked = masonry.stream().anyMatch(face ->
                    Math.abs(face.getCentroid().getY() - span.getCentroid().getY()) < 0.18 &&
                    span.intersection(face.buffer(0.08)).getLength() > 0.25);
            blocked |= openings.stream().anyMatch(other -> other != opening && other.span != null &&
                    !"GATE".equals(other.type) && span.distance(other.span) < 0.18 &&
                    span.intersection(other.span.buffer(0.18)).getLength() > 0.3);
            blocked |= annotatedWindowOccupies(span, openings);
            if (blocked) continue;
            double score = span.getCentroid().distance(opening.center);
            if (score >= bestScore) continue;
            best = new BoundarySpan(span, List.of(left.id, right.id)); bestScore = score;
        }
        return best;
    }

    private boolean annotatedWindowOccupies(LineString span, List<Opening> openings) {
        return openings.stream().anyMatch(other -> "WINDOW".equals(other.type) && other.annotationId != null &&
                span.getCentroid().distance(other.center) < 0.85);
    }

    private LineString spanOn(LineString axis, double start, double end) {
        Coordinate[] points = axis.getCoordinates();
        double length = axis.getLength();
        double a = Math.max(0, Math.min(length, start)), b = Math.max(0, Math.min(length, end));
        return geometryFactory.createLineString(new Coordinate[] {
                new Coordinate(points[0].x+(points[1].x-points[0].x)*a/length, points[0].y+(points[1].y-points[0].y)*a/length),
                new Coordinate(points[0].x+(points[1].x-points[0].x)*b/length, points[0].y+(points[1].y-points[0].y)*b/length)});
    }

    private static List<String> strings(JsonNode values) {
        List<String> result = new ArrayList<>();
        if (values.isArray()) for (JsonNode value : values) result.add(value.asText());
        return result;
    }

    private List<PathShape> loadPaths(String id, LayoutMode mode) {
        String column = mode == LayoutMode.ORIGINAL_LAYOUT ? "geom_original" : "geom";
        return jdbc.query("SELECT source_id,layer,candidate_class,ST_AsText(" + column + ") FROM house_path WHERE project_id=? ORDER BY source_id",
                (rs, row) -> new PathShape(rs.getString(1), rs.getString(2), rs.getString(3), parse(rs.getString(4))), id);
    }

    private List<Label> loadLabels(String id, LayoutMode mode) {
        String column = mode == LayoutMode.ORIGINAL_LAYOUT ? "geom_original" : "geom";
        return jdbc.query("SELECT source_id,original_json::text,ST_AsText(" + column + ") FROM house_text WHERE project_id=? ORDER BY source_id",
                (rs, row) -> new Label(rs.getString(1), mapper.readTree(rs.getString(2)).path("text").asText(),
                        (Point) parse(rs.getString(3))), id);
    }

    private List<Measure> loadMeasures(String id, List<Label> labels) {
        Map<String, String> text = new HashMap<>();
        for (Label label : labels) text.put(label.id, label.text);
        return jdbc.query("SELECT original_json::text FROM house_measurement WHERE project_id=? ORDER BY source_index",
                (rs, row) -> {
                    JsonNode node = mapper.readTree(rs.getString(1));
                    String textId = node.path("text_id").asText("");
                    return new Measure(node.path("id").asText(), node.path("code").asText(""),
                            node.path("value_m").asDouble(), textId, text.getOrDefault(textId, ""));
                }, id);
    }

    private List<Opening> openings(List<PathShape> paths, List<Label> labels, List<Measure> measures,
                                   List<Wall> walls, LayoutMode mode) {
        List<PathShape> candidates = paths.stream().filter(p -> "opening_candidate".equals(p.candidate) && p.geometry != null).toList();
        List<Label> annotations = labels.stream().filter(l -> OpeningSemantics.type(l.text) != null && l.point != null).toList();
        Map<String, Label> labelById = new HashMap<>();
        for (Label label : labels) labelById.put(label.id, label);
        Set<String> usedPaths = new HashSet<>();
        List<Opening> result = new ArrayList<>();
        for (Label label : annotations) {
            String type = OpeningSemantics.type(label.text);
            Map<String, Geometry> available = new LinkedHashMap<>();
            for (PathShape path : candidates) if (!usedPaths.contains(path.id)) available.put(path.id, path.geometry);
            String shapeId = OpeningSemantics.nearestCandidate(label.point, available, annotationDistance);
            PathShape shape = shapeId == null ? null : candidates.stream().filter(p -> p.id.equals(shapeId)).findFirst().orElse(null);
            if (shape != null) usedPaths.add(shape.id);
            Point center = shape == null ? label.point : center(shape.geometry);
            Double width = shape == null ? null : majorLength(shape.geometry);
            if (width != null && (width < 0.35 || width > 3.5)) width = null;
            List<String> measureIds = new ArrayList<>();
            Double height = null, sill = null;
            for (Measure measure : measures) {
                Label source = labelById.get(measure.textId);
                if (source == null || source.point == null || measure.value <= 0 || measure.value > 4) continue;
                if (source.point.distance(label.point) > 0.65 || nearestAnnotation(source.point, annotations) != label) continue;
                String role = OpeningSemantics.measurementRole(type, measure.code, measure.text);
                if ("HEIGHT".equals(role)) {
                    height = measure.value; measureIds.add(measure.id);
                } else if ("SILL".equals(role)) {
                    sill = measure.value; measureIds.add(measure.id);
                }
            }
            Wall associated = shape == null || width == null ? null : nearestWall(center, shape.geometry, walls);
            Double position = associated == null ? null : position(center, associated.axis());
            String status = associated != null ? "ASSOCIATED" : shape != null ? "GEOMETRY_CANDIDATE" : "ANNOTATION_ONLY";
            String id = stableId(mode + ":text:" + label.id);
            result.add(new Opening(id, shape == null ? List.of() : List.of(shape.id), List.of(label.id), measureIds,
                    associated == null ? null : associated.id(), type, status, center, position, width, height, sill));
        }
        for (PathShape shape : candidates) if (!usedPaths.contains(shape.id)) {
            Point center = center(shape.geometry);
            Double width = majorLength(shape.geometry);
            Wall wall = nearestWall(center, shape.geometry, walls);
            result.add(new Opening(stableId(mode + ":path:" + shape.id), List.of(shape.id), List.of(), List.of(),
                    wall == null ? null : wall.id(), "UNKNOWN_OPENING", "UNCLASSIFIED", center,
                    wall == null ? null : position(center, wall.axis()), width, null, null));
        }
        return result;
    }

    private Wall nearestWall(Point center, Geometry opening, List<Wall> walls) {
        LineString major = majorLine(opening);
        if (major == null) return null;
        Wall best = null; double bestDistance = Double.POSITIVE_INFINITY;
        for (Wall wall : walls) {
            if (angle(major, wall.axis()) > Math.toRadians(12)) continue;
            double distance = wall.axis().distance(center);
            if (distance > wall.thickness() / 2 + wallAssociationDistance) continue;
            double station = position(center, wall.axis());
            if (station < 0.05 || station > wall.axis().getLength() - 0.05) continue;
            if (distance < bestDistance) { best = wall; bestDistance = distance; }
        }
        return best;
    }

    private static Label nearestAnnotation(Point point, List<Label> labels) {
        return labels.stream().min(Comparator.comparingDouble(l -> l.point.distance(point))).orElse(null);
    }

    private static double angle(LineString a, LineString b) {
        Coordinate[] x = a.getCoordinates(), y = b.getCoordinates();
        double ax = x[1].x-x[0].x, ay=x[1].y-x[0].y, bx=y[1].x-y[0].x, by=y[1].y-y[0].y;
        return Math.acos(Math.min(1, Math.abs((ax*bx+ay*by)/(Math.hypot(ax,ay)*Math.hypot(bx,by)))));
    }

    private static double position(Point center, LineString axis) {
        Coordinate[] p = axis.getCoordinates();
        double dx=p[1].x-p[0].x, dy=p[1].y-p[0].y;
        return ((center.getX()-p[0].x)*dx+(center.getY()-p[0].y)*dy)/Math.hypot(dx,dy);
    }

    private Point center(Geometry geometry) { return geometryFactory.createPoint(geometry.getEnvelopeInternal().centre()); }

    private static Double majorLength(Geometry geometry) {
        LineString line = majorLine(geometry);
        return line == null ? null : line.getLength();
    }

    private static LineString majorLine(Geometry geometry) {
        GeometryFactory factory = new GeometryFactory();
        Coordinate a = null, b = null; double longest = 0;
        for (LineString line : lines(geometry)) {
            Coordinate[] points = line.getCoordinates();
            for (int i = 1; i < points.length; i++) {
                double length = points[i-1].distance(points[i]);
                if (length > longest) { longest = length; a = points[i-1]; b = points[i]; }
            }
        }
        return a == null ? null : factory.createLineString(new Coordinate[] {a, b});
    }

    private static List<LineString> lines(Geometry geometry) {
        List<LineString> result = new ArrayList<>();
        for (int i = 0; i < geometry.getNumGeometries(); i++)
            if (geometry.getGeometryN(i) instanceof LineString line) result.add(line);
        return result;
    }

    private static Geometry parse(String wkt) {
        if (wkt == null) return null;
        try { return new WKTReader().read(wkt); }
        catch (Exception ex) { throw new IllegalArgumentException("Geometria PostGIS inválida", ex); }
    }
    private String json(List<String> ids) { return mapper.writeValueAsString(ids); }
    private static String stableId(String value) { return UUID.nameUUIDFromBytes(value.getBytes(StandardCharsets.UTF_8)).toString(); }
}
