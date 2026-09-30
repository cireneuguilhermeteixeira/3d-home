package br.com.casa628.importation;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;
import org.locationtech.jts.geom.Geometry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
public class FloorPlanImportService implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final JsonMapper mapper;
    private final String file;

    public FloorPlanImportService(JdbcTemplate jdbc, JsonMapper mapper, @Value("${house.import-file:}") String file) {
        this.jdbc = jdbc; this.mapper = mapper; this.file = file;
    }

    @Override public void run(ApplicationArguments args) throws Exception {
        if (!file.isBlank()) importFile(Path.of(file));
    }

    @Transactional
    public void importFile(Path path) throws Exception {
        if (!Files.isRegularFile(path)) throw new IllegalArgumentException("Arquivo de planta não encontrado: " + path);
        JsonNode root = mapper.readTree(Files.readString(path));
        JsonNode paths = root.path("paths"), site = root.path("site");
        if (!paths.isArray() || paths.isEmpty() || !site.isObject())
            throw new IllegalArgumentException("JSON precisa conter site e paths não vazios");
        double width = number(root.path("project"), "lot_width_m", number(site, "width", 12));
        double depth = number(root.path("project"), "lot_depth_m", number(site, "depth", 33));
        if (width <= 0 || depth <= 0) throw new IllegalArgumentException("Dimensões do terreno inválidas");
        String id = root.path("project").path("id").asText("casa628");
        if (id.isBlank()) id = "casa628";
        Set<String> ids = new HashSet<>();
        for (JsonNode item : paths) {
            String sourceId = item.path("id").asText();
            if (sourceId.isBlank() || !ids.add(sourceId)) throw new IllegalArgumentException("ID de caminho ausente ou duplicado: " + sourceId);
        }
        Geometry siteGeometry = LocalGeometry.read(site.path("geom_local"));
        if (siteGeometry != null && !(siteGeometry instanceof org.locationtech.jts.geom.Polygon))
            throw new IllegalArgumentException("Terreno precisa ser um polígono");
        jdbc.update("INSERT INTO house_project(id, project_json, drawing_json, site_json, original_json, site_width, site_depth, site_geom) VALUES (?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?, ST_GeomFromText(?,0)) ON CONFLICT(id) DO UPDATE SET project_json=excluded.project_json, drawing_json=excluded.drawing_json, site_json=excluded.site_json, original_json=excluded.original_json, site_width=excluded.site_width, site_depth=excluded.site_depth, site_geom=excluded.site_geom",
                id, root.path("project").toString(), root.path("drawing").toString(), site.toString(), root.toString(), width, depth,
                siteGeometry == null ? null : siteGeometry.toText());
        jdbc.update("DELETE FROM house_path WHERE project_id=?", id);
        jdbc.update("DELETE FROM house_measurement WHERE project_id=?", id);
        for (JsonNode item : paths) {
            Geometry geometry = LocalGeometry.read(item.path("geom_local"));
            jdbc.update("INSERT INTO house_path(project_id,source_id,layer,candidate_class,original_json,geom) VALUES (?,?,?,?,?::jsonb,ST_GeomFromText(?,0))",
                    id, item.path("id").asText(), item.path("layer").asText(""), item.path("candidate_class").asText(""), item.toString(), geometry == null ? null : geometry.toText());
        }
        JsonNode measurements = root.path("measurements");
        if (measurements.isArray()) for (int i = 0; i < measurements.size(); i++)
            jdbc.update("INSERT INTO house_measurement(project_id,source_index,original_json) VALUES (?,?,?::jsonb)", id, i, measurements.get(i).toString());
    }

    private static double number(JsonNode node, String key, double fallback) {
        JsonNode value = node.path(key);
        return value.isNumber() ? value.asDouble() : fallback;
    }
}
