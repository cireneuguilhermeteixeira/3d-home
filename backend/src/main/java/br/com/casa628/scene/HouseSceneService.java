package br.com.casa628.scene;

import br.com.casa628.scene.HouseScene.DrawingLine;
import br.com.casa628.scene.HouseScene.Point;
import br.com.casa628.scene.HouseScene.Site;
import br.com.casa628.scene.HouseScene.Wall;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.io.WKTReader;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
public class HouseSceneService {
    private final JdbcTemplate jdbc;
    private final JsonMapper mapper;
    private final double defaultHeight, defaultThickness, minWallLength;

    public HouseSceneService(JdbcTemplate jdbc, JsonMapper mapper,
            @Value("${house.wall-height:2.8}") double defaultHeight,
            @Value("${house.wall-thickness:0.15}") double defaultThickness,
            @Value("${house.min-wall-length:0.5}") double minWallLength) {
        this.jdbc = jdbc; this.mapper = mapper;
        this.defaultHeight = defaultHeight; this.defaultThickness = defaultThickness; this.minWallLength = minWallLength;
    }

    public HouseScene getScene() {
        List<Site> sites = jdbc.query("SELECT site_width,site_depth,ST_AsText(site_geom) FROM house_project ORDER BY id LIMIT 1",
                (rs, row) -> {
                    List<Point> boundary = new ArrayList<>();
                    String wkt = rs.getString(3);
                    if (wkt != null) {
                        try {
                            for (Coordinate c : new WKTReader().read(wkt).getCoordinates()) boundary.add(new Point(c.x, c.y));
                        } catch (Exception ex) { throw new IllegalStateException("Terreno inválido no banco", ex); }
                    }
                    return new Site(rs.getDouble(1), rs.getDouble(2), boundary);
                });
        if (sites.isEmpty()) return new HouseScene(new Site(12, 33, List.of()), List.of(), List.of(), List.of(), List.of(), List.of());
        String projectId = jdbc.queryForObject("SELECT id FROM house_project ORDER BY id LIMIT 1", String.class);
        List<Wall> walls = new ArrayList<>();
        List<DrawingLine> lines = new ArrayList<>();
        Set<String> wallSegments = new HashSet<>();
        jdbc.query("SELECT source_id,layer,candidate_class,original_json::text,ST_AsText(geom) FROM house_path WHERE project_id=? ORDER BY source_id",
                rs -> {
                    String id = rs.getString(1), layer = rs.getString(2), candidate = rs.getString(3);
                    String wkt = rs.getString(5);
                    if (wkt == null) return;
                    Geometry geom;
                    try { geom = new WKTReader().read(wkt); }
                    catch (Exception ex) { throw new IllegalStateException("Geometria inválida no banco: " + id, ex); }
                    JsonNode original = mapper.readTree(rs.getString(4));
                    boolean wall = isWall(candidate, layer);
                    int index = 0;
                    for (LineString line : lineStrings(geom)) {
                        List<Point> points = new ArrayList<>();
                        for (Coordinate c : line.getCoordinates()) points.add(new Point(c.x, c.y));
                        if (points.size() < 2) continue;
                        lines.add(new DrawingLine(id + ":" + index++, layer, candidate, points));
                        if (!wall) continue;
                        Double height = positive(original, "height_m", "height");
                        Double thickness = positive(original, "thickness_m", "thickness");
                        for (int j = 1; j < points.size(); j++) {
                            Point start = points.get(j - 1), end = points.get(j);
                            double length = Math.hypot(end.x() - start.x(), end.y() - start.y());
                            if (length < minWallLength || !wallSegments.add(segmentKey(start, end))) continue;
                            walls.add(new Wall(id + ":" + (index - 1) + ":" + j, start, end, length,
                                    height == null ? defaultHeight : height,
                                    thickness == null ? defaultThickness : thickness,
                                    "candidate", height == null, thickness == null));
                        }
                    }
                }, projectId);
        List<JsonNode> measurements = jdbc.query("SELECT original_json::text FROM house_measurement WHERE project_id=? ORDER BY source_index",
                (rs, row) -> mapper.readTree(rs.getString(1)), projectId);
        return new HouseScene(sites.getFirst(), walls, lines, List.of(), List.of(), measurements);
    }

    static boolean isWall(String candidate, String layer) {
        String c = candidate == null ? "" : candidate.toLowerCase(Locale.ROOT);
        String l = layer == null ? "" : layer.toLowerCase(Locale.ROOT);
        if (c.contains("door") || c.contains("window") || c.contains("porta") || c.contains("janela")) return false;
        return c.contains("wall") || c.contains("muro") || c.contains("parede") || c.contains("alvenaria")
                || l.contains("alvenaria") || l.contains("parede") || l.contains("muro");
    }

    private static List<LineString> lineStrings(Geometry geometry) {
        List<LineString> result = new ArrayList<>();
        for (int i = 0; i < geometry.getNumGeometries(); i++) {
            Geometry part = geometry.getGeometryN(i);
            if (part instanceof LineString line) result.add(line);
        }
        return result;
    }

    private static Double positive(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode value = node.path(key);
            if (value.isNumber() && value.asDouble() > 0) return value.asDouble();
        }
        return null;
    }

    private static String segmentKey(Point a, Point b) {
        String first = Math.round(a.x() * 1000) + "," + Math.round(a.y() * 1000);
        String second = Math.round(b.x() * 1000) + "," + Math.round(b.y() * 1000);
        return first.compareTo(second) <= 0 ? first + "|" + second : second + "|" + first;
    }
}
