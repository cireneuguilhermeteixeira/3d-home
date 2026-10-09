package br.com.casa628.importation;

import java.util.ArrayList;
import java.util.List;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.io.WKTReader;
import tools.jackson.databind.JsonNode;

/** Parses GeoJSON-like geometry without applying a coordinate transformation. */
public final class LocalGeometry {
    private static final GeometryFactory FACTORY = new GeometryFactory();
    private LocalGeometry() {}

    public static Geometry read(JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (node.isTextual()) {
            try { return new WKTReader(FACTORY).read(node.asText()); }
            catch (Exception ex) { throw new IllegalArgumentException("geom_local WKT inválido", ex); }
        }
        if (node.isObject() && "Polygon".equalsIgnoreCase(node.path("type").asText())) {
            JsonNode ring = node.path("coordinates").path(0);
            List<Coordinate> coordinates = new ArrayList<>();
            for (JsonNode vertex : ring) {
                Coordinate coordinate = point(vertex);
                if (coordinate == null) throw new IllegalArgumentException("Polígono local inválido");
                coordinates.add(coordinate);
            }
            if (coordinates.size() < 3) throw new IllegalArgumentException("Polígono local incompleto");
            if (!coordinates.getFirst().equals2D(coordinates.getLast())) coordinates.add(coordinates.getFirst());
            return FACTORY.createPolygon(coordinates.toArray(Coordinate[]::new));
        }
        JsonNode coordinates = node.isObject() ? node.path("coordinates") : node;
        if (coordinates.isMissingNode() && node.isObject()) coordinates = node.path("points");
        if (coordinates.isMissingNode() && node.isObject()) coordinates = node.path("vertices");
        if (coordinates.isMissingNode()) return null;
        List<Geometry> parts = new ArrayList<>();
        collect(coordinates, parts);
        if (parts.isEmpty()) return null;
        return parts.size() == 1 ? parts.getFirst() : FACTORY.createGeometryCollection(parts.toArray(Geometry[]::new));
    }

    private static void collect(JsonNode node, List<Geometry> parts) {
        if (node == null || !node.isArray() || node.isEmpty()) return;
        if (point(node) != null) {
            parts.add(FACTORY.createPoint(point(node)));
            return;
        }
        List<Coordinate> line = new ArrayList<>();
        for (JsonNode child : node) {
            Coordinate c = point(child);
            if (c == null) { line.clear(); break; }
            line.add(c);
        }
        if (line.size() > 1) {
            parts.add(FACTORY.createLineString(line.toArray(Coordinate[]::new)));
            return;
        }
        for (JsonNode child : node) collect(child, parts);
    }

    private static Coordinate point(JsonNode node) {
        if (node == null) return null;
        JsonNode x = node.isArray() && node.size() >= 2 ? node.get(0) : node.path("x");
        JsonNode y = node.isArray() && node.size() >= 2 ? node.get(1) : node.path("y");
        if (!x.isNumber() || !y.isNumber()) return null;
        double a = x.asDouble(), b = y.asDouble();
        return Double.isFinite(a) && Double.isFinite(b) ? new Coordinate(a, b) : null;
    }
}
