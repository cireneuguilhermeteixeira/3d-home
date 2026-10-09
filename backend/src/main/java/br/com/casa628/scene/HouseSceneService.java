package br.com.casa628.scene;

import br.com.casa628.geometry.LayoutMode;
import br.com.casa628.scene.HouseScene.DrawingLine;
import br.com.casa628.scene.HouseScene.Opening;
import br.com.casa628.scene.HouseScene.Point;
import br.com.casa628.scene.HouseScene.RoomMarker;
import br.com.casa628.scene.HouseScene.Measurement;
import br.com.casa628.scene.HouseScene.MeasurementLink;
import br.com.casa628.scene.HouseScene.Element;
import br.com.casa628.scene.HouseScene.Site;
import br.com.casa628.scene.HouseScene.Wall;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Set;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.io.WKTReader;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
public class HouseSceneService {
    private final JdbcTemplate jdbc;
    private final JsonMapper mapper;

    public HouseSceneService(JdbcTemplate jdbc, JsonMapper mapper) { this.jdbc = jdbc; this.mapper = mapper; }

    public HouseScene getScene(LayoutMode mode) {
        String projectId = jdbc.query("SELECT id FROM house_project ORDER BY id LIMIT 1",
                rs -> rs.next() ? rs.getString(1) : null);
        if (projectId == null) return new HouseScene(new Site(12, 33, List.of(), mode.name()),
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        String siteColumn = mode == LayoutMode.ORIGINAL_LAYOUT ? "site_geom_original" : "site_geom";
        Site site = jdbc.queryForObject("SELECT site_width,site_depth,ST_AsText(" + siteColumn + ") FROM house_project WHERE id=?",
                (rs, row) -> {
                    List<Point> boundary = new ArrayList<>();
                    Geometry geometry = parse(rs.getString(3));
                    if (geometry != null) for (Coordinate c : geometry.getCoordinates()) boundary.add(point(c));
                    return new Site(rs.getDouble(1), rs.getDouble(2), boundary, mode.name());
                }, projectId);
        List<Wall> walls = jdbc.query("SELECT id,ST_AsText(axis),thickness,height,height_source_id,status,source_path_ids::text FROM house_derived_wall WHERE project_id=? AND layout_mode=? ORDER BY id",
                (rs, row) -> {
                    Coordinate[] coordinates = parse(rs.getString(2)).getCoordinates();
                    Double height = rs.getObject(4, Double.class);
                    return new Wall(rs.getString(1), point(coordinates[0]), point(coordinates[1]),
                            coordinates[0].distance(coordinates[1]), height,
                            rs.getDouble(3), rs.getString(6), height == null, false,
                            ids(rs.getString(7)), rs.getString(5));
                }, projectId, mode.name());
        Set<String> represented = new HashSet<>();
        for (Wall wall : walls) represented.addAll(wall.sourcePathIds());
        List<Opening> openings = jdbc.query("SELECT id,type,status,wall_id,ST_AsText(center),position_along_wall,width,height,sill_height,source_path_ids::text,source_text_ids::text,measurement_ids::text,annotation_id,subtype,transom_height,ST_AsText(span) FROM house_derived_opening WHERE project_id=? AND layout_mode=? ORDER BY id",
                (rs, row) -> {
                    Geometry span = parse(rs.getString(16));
                    Coordinate[] ends = span == null ? null : span.getCoordinates();
                    return new Opening(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4),
                            point(parse(rs.getString(5)).getCoordinate()), rs.getObject(6, Double.class),
                            rs.getObject(7, Double.class), rs.getObject(8, Double.class), rs.getObject(9, Double.class),
                            ids(rs.getString(10)), ids(rs.getString(11)), ids(rs.getString(12)),
                            rs.getString(13), rs.getString(14), rs.getObject(15, Double.class),
                            ends == null ? null : point(ends[0]), ends == null ? null : point(ends[ends.length-1]));
                }, projectId, mode.name());
        List<RoomMarker> rooms = jdbc.query("SELECT id,label,ST_AsText(center),status,source_text_id,room_type FROM house_derived_room_marker WHERE project_id=? AND layout_mode=? ORDER BY label",
                (rs, row) -> new RoomMarker(rs.getString(1), rs.getString(2),
                        "KITCHEN".equals(rs.getString(6)) ? "Cozinha" : null,
                        point(parse(rs.getString(3)).getCoordinate()), rs.getString(4), rs.getString(5), rs.getString(6)),
                projectId, mode.name());
        List<DrawingLine> lines = new ArrayList<>();
        String pathColumn = mode == LayoutMode.ORIGINAL_LAYOUT ? "geom_original" : "geom";
        jdbc.query("SELECT source_id,layer,candidate_class,ST_AsText(" + pathColumn + ") FROM house_path WHERE project_id=? ORDER BY source_id",
                rs -> {
                    String id = rs.getString(1);
                    Geometry geometry = parse(rs.getString(4));
                    if (geometry == null) return;
                    int index = 0;
                    for (int i = 0; i < geometry.getNumGeometries(); i++) {
                        if (!(geometry.getGeometryN(i) instanceof LineString line)) continue;
                        List<Point> points = new ArrayList<>();
                        for (Coordinate c : line.getCoordinates()) points.add(point(c));
                        if (points.size() > 1) lines.add(new DrawingLine(id + ":" + index++, id,
                                rs.getString(2), rs.getString(3), represented.contains(id), points));
                    }
                }, projectId);
        List<JsonNode> sourceMeasurements = jdbc.query("SELECT original_json::text FROM house_measurement WHERE project_id=? ORDER BY source_index",
                (rs, row) -> mapper.readTree(rs.getString(1)), projectId);
        Map<String, JsonNode> measurementById = new HashMap<>();
        for (JsonNode original : sourceMeasurements) measurementById.put(original.path("id").asText(), original);
        Map<String, List<MeasurementLink>> links = new HashMap<>();
        for (Opening opening : openings) for (String measurementId : opening.measurementIds())
            links.computeIfAbsent(measurementId, ignored -> new ArrayList<>()).add(new MeasurementLink(
                    "OPENING", opening.id(), measurementRole(opening, measurementById.get(measurementId)),
                    opening.wallId() != null || opening.spanStart() != null ? "ASSOCIATED_GEOMETRY" : "ANNOTATION_ONLY"));
        List<Measurement> measurements = sourceMeasurements.stream().map(original -> {
                    String id = original.path("id").asText();
                    return new Measurement(id, original.path("code").asText(),
                            original.path("value_m").isNumber() ? original.path("value_m").asDouble() : null,
                            original, links.getOrDefault(id, List.of()));
                }).toList();
        String annotationColumn = mode == LayoutMode.ORIGINAL_LAYOUT ? "geom_original" : "geom";
        List<Element> elements = jdbc.query("SELECT source_id,original_json::text,ST_AsText(" + annotationColumn + ") FROM house_semantic_item WHERE project_id=? AND kind='ANNOTATION' ORDER BY source_id",
                (rs, row) -> {
                    JsonNode data = mapper.readTree(rs.getString(2));
                    String type = data.path("element_type").asText();
                    if (type.contains("WINDOW") || type.contains("GATE") || type.contains("DOOR")) return null;
                    Double height = null; String heightId = null;
                    for (JsonNode dimension : data.path("dimensions")) if ("H".equalsIgnoreCase(dimension.path("code").asText())) {
                        height = dimension.path("value_m").asDouble();
                        heightId = dimension.path("measurement_id").asText();
                        break;
                    }
                    Geometry geometry = parse(rs.getString(3));
                    return new Element(rs.getString(1), type, data.path("classification_status").asText("ANNOTATION_ONLY"),
                            geometry == null ? null : point(geometry.getCoordinate()), height, heightId,
                            ids(data.path("source_text_ids").toString()));
                }, projectId).stream().filter(e -> e != null).toList();
        return new HouseScene(site, walls, lines, rooms, openings, measurements, elements);
    }

    private List<String> ids(String json) {
        List<String> result = new ArrayList<>();
        if (json != null) for (JsonNode value : mapper.readTree(json)) result.add(value.asText());
        return result;
    }
    private static String measurementRole(Opening opening, JsonNode measurement) {
        if (measurement == null) return "UNCONFIRMED";
        String code = measurement.path("code").asText("").toUpperCase();
        if ("PD".equals(code) && "WINDOW".equals(opening.type())) return "SILL_HEIGHT";
        if ("H".equals(code) && opening.transomHeight() != null &&
                Math.abs(measurement.path("value_m").asDouble() - opening.transomHeight()) < 0.001)
            return "TRANSOM_HEIGHT";
        if ("H".equals(code)) return "ELEMENT_HEIGHT";
        return "UNCONFIRMED";
    }
    private static Point point(Coordinate c) { return new Point(c.x, c.y); }
    private static Geometry parse(String wkt) {
        if (wkt == null) return null;
        try { return new WKTReader().read(wkt); }
        catch (Exception ex) { throw new IllegalStateException("Geometria inválida no PostGIS", ex); }
    }
}
