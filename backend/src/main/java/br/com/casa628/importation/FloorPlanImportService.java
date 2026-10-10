package br.com.casa628.importation;

import java.nio.file.Files;
import java.nio.file.Path;
import java.io.InputStream;
import java.util.HashSet;
import java.util.Set;
import br.com.casa628.geometry.LayoutMode;
import br.com.casa628.geometry.LayoutTransform;
import br.com.casa628.geometry.ArchitecturalProcessingService;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
public class FloorPlanImportService {
    private final JdbcTemplate jdbc;
    private final JsonMapper mapper;
    private final ArchitecturalProcessingService processing;
    private final GeometryFactory geometryFactory = new GeometryFactory();

    public FloorPlanImportService(JdbcTemplate jdbc, JsonMapper mapper, ArchitecturalProcessingService processing) {
        this.jdbc = jdbc; this.mapper = mapper; this.processing = processing;
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
        LayoutTransform transform = new LayoutTransform(root.path("drawing"), width, depth);
        String id = root.path("project").path("id").asText("casa628");
        if (id.isBlank()) id = "casa628";
        Set<String> ids = new HashSet<>();
        for (JsonNode item : paths) {
            String sourceId = item.path("id").asText();
            if (sourceId.isBlank() || !ids.add(sourceId)) throw new IllegalArgumentException("ID de caminho ausente ou duplicado: " + sourceId);
        }
        Geometry pdfSite = LocalGeometry.read(site.path("geom_pdf"));
        Geometry siteGeometry = transform.apply(pdfSite, LayoutMode.RECTIFIED_LAYOUT);
        Geometry originalSite = transform.apply(pdfSite, LayoutMode.ORIGINAL_LAYOUT);
        if (siteGeometry != null && !(siteGeometry instanceof org.locationtech.jts.geom.Polygon))
            throw new IllegalArgumentException("Terreno precisa ser um polígono");
        jdbc.update("INSERT INTO house_project(id, project_json, drawing_json, site_json, original_json, site_width, site_depth, site_geom, site_geom_original) VALUES (?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?, ST_GeomFromText(?,0), ST_GeomFromText(?,0)) ON CONFLICT(id) DO UPDATE SET project_json=excluded.project_json, drawing_json=excluded.drawing_json, site_json=excluded.site_json, original_json=excluded.original_json, site_width=excluded.site_width, site_depth=excluded.site_depth, site_geom=excluded.site_geom, site_geom_original=excluded.site_geom_original",
                id, root.path("project").toString(), root.path("drawing").toString(), site.toString(), root.toString(), width, depth,
                siteGeometry == null ? null : siteGeometry.toText(), originalSite == null ? null : originalSite.toText());
        jdbc.update("DELETE FROM house_derived_opening WHERE project_id=?", id);
        jdbc.update("DELETE FROM house_derived_wall WHERE project_id=?", id);
        jdbc.update("DELETE FROM house_semantic_item WHERE project_id=?", id);
        jdbc.update("DELETE FROM house_path WHERE project_id=?", id);
        jdbc.update("DELETE FROM house_measurement WHERE project_id=?", id);
        jdbc.update("DELETE FROM house_text WHERE project_id=?", id);
        for (JsonNode item : paths) {
            Geometry pdf = LocalGeometry.read(item.path("geom_pdf"));
            Geometry rectified = transform.apply(pdf, LayoutMode.RECTIFIED_LAYOUT);
            Geometry original = transform.apply(pdf, LayoutMode.ORIGINAL_LAYOUT);
            jdbc.update("INSERT INTO house_path(project_id,source_id,layer,candidate_class,original_json,geom,geom_original) VALUES (?,?,?,?,?::jsonb,ST_GeomFromText(?,0),ST_GeomFromText(?,0))",
                    id, item.path("id").asText(), item.path("layer").asText(""), item.path("candidate_class").asText(""), item.toString(),
                    rectified == null ? null : rectified.toText(), original == null ? null : original.toText());
        }
        JsonNode texts = root.path("texts");
        if (texts.isArray()) for (JsonNode item : texts) {
            JsonNode origin = item.path("origin_pdf");
            if (!origin.isArray() || origin.size() < 2) continue;
            Coordinate rectified = transform.apply(origin, LayoutMode.RECTIFIED_LAYOUT);
            Coordinate original = transform.apply(origin, LayoutMode.ORIGINAL_LAYOUT);
            jdbc.update("INSERT INTO house_text(project_id,source_id,original_json,geom,geom_original) VALUES (?,?,?::jsonb,ST_GeomFromText(?,0),ST_GeomFromText(?,0))",
                    id, item.path("id").asText(), item.toString(), geometryFactory.createPoint(rectified).toText(), geometryFactory.createPoint(original).toText());
        }
        JsonNode measurements = root.path("measurements");
        if (measurements.isArray()) for (int i = 0; i < measurements.size(); i++)
            jdbc.update("INSERT INTO house_measurement(project_id,source_index,original_json) VALUES (?,?,?::jsonb)", id, i, measurements.get(i).toString());
        JsonNode semantic = root.path("semantic_layer");
        if (semantic.isObject()) {
            importSemanticItems(id, semantic.path("annotation_groups"), "ANNOTATION", transform);
            importSemanticItems(id, semantic.path("room_number_markers"), "ROOM_MARKER", transform);
            importSemanticItems(id, semantic.path("user_provided_evidence"), "USER_EVIDENCE", transform);
            importSemanticItems(id, semantic.path("ungrouped_source_texts"), "UNGROUPED_TEXT", transform);
            for (String code : new String[] {"H", "PD", "PDL", "PDV", "PDF", "PDT"}) {
                JsonNode definition = semantic.path("height_code_dictionary").path(code);
                if (!definition.isObject()) continue;
                jdbc.update("INSERT INTO house_semantic_item(project_id,kind,source_id,original_json) VALUES (?,?,?,?::jsonb)",
                        id, "HEIGHT_CODE", code, definition.toString());
            }
            JsonNode constraints = semantic.path("vertical_constraints");
            if (constraints.isObject()) jdbc.update("INSERT INTO house_semantic_item(project_id,kind,source_id,original_json) VALUES (?,?,?,?::jsonb)",
                    id, "VERTICAL_CONSTRAINTS", "default", constraints.toString());
        }
        importOwnerCorrections(id, transform);
        processing.rebuild(id);
    }

    private void importOwnerCorrections(String projectId, LayoutTransform transform) throws Exception {
        try (InputStream stream = getClass().getResourceAsStream("/casa628_owner_corrections.json")) {
            if (stream == null) return;
            JsonNode items = mapper.readTree(stream).path("corrections");
            if (!items.isArray()) throw new IllegalArgumentException("Correções do proprietário inválidas");
            Set<String> ids = new HashSet<>();
            for (JsonNode item : items) {
                String sourceId = item.path("id").asText();
                JsonNode position = item.path("position_original_m");
                if (sourceId.isBlank() || !ids.add(sourceId) || !position.isArray() || position.size() != 2 ||
                        !position.get(0).isNumber() || !position.get(1).isNumber())
                    throw new IllegalArgumentException("Ponto de correção inválido: " + sourceId);
                double x = position.get(0).asDouble(), y = position.get(1).asDouble();
                Coordinate original = transform.fromOriginalMetric(x, y, LayoutMode.ORIGINAL_LAYOUT);
                Coordinate rectified = transform.fromOriginalMetric(x, y, LayoutMode.RECTIFIED_LAYOUT);
                jdbc.update("INSERT INTO house_semantic_item(project_id,kind,source_id,original_json,geom,geom_original) VALUES (?,?,?,?::jsonb,ST_GeomFromText(?,0),ST_GeomFromText(?,0))",
                        projectId, "OWNER_CORRECTION", sourceId, item.toString(),
                        geometryFactory.createPoint(rectified).toText(), geometryFactory.createPoint(original).toText());
            }
        }
    }

    private void importSemanticItems(String projectId, JsonNode items, String kind, LayoutTransform transform) {
        if (!items.isArray()) return;
        for (int index = 0; index < items.size(); index++) {
            JsonNode item = items.get(index);
            String sourceId = switch (kind) {
                case "ROOM_MARKER" -> "room-" + item.path("room_number").asText(index + 1 + "");
                case "UNGROUPED_TEXT" -> item.path("source_text_id").asText("text-" + index);
                default -> item.path("id").asText(kind + "-" + index);
            };
            JsonNode anchor = item.path("anchor_pdf");
            if (!anchor.isArray()) anchor = item.path("approx_position_pdf");
            String originalWkt = null, rectifiedWkt = null;
            if (anchor.isArray() && anchor.size() >= 2 && anchor.get(0).isNumber() && anchor.get(1).isNumber()) {
                originalWkt = geometryFactory.createPoint(transform.apply(anchor, LayoutMode.ORIGINAL_LAYOUT)).toText();
                rectifiedWkt = geometryFactory.createPoint(transform.apply(anchor, LayoutMode.RECTIFIED_LAYOUT)).toText();
            }
            jdbc.update("INSERT INTO house_semantic_item(project_id,kind,source_id,original_json,geom,geom_original) VALUES (?,?,?,?::jsonb,ST_GeomFromText(?,0),ST_GeomFromText(?,0))",
                    projectId, kind, sourceId, item.toString(), rectifiedWkt, originalWkt);
        }
    }

    private static double number(JsonNode node, String key, double fallback) {
        JsonNode value = node.path(key);
        return value.isNumber() ? value.asDouble() : fallback;
    }
}
