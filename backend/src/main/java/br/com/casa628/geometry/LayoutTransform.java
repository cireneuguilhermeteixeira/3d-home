package br.com.casa628.geometry;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.util.AffineTransformation;
import tools.jackson.databind.JsonNode;

/** Both metric layouts are calculated directly from PDF coordinates. */
public final class LayoutTransform {
    private final double frontX, frontY, scaleX, scaleY, rectificationShear;

    public LayoutTransform(JsonNode drawing, double width, double depth) {
        JsonNode corners = drawing.path("calibration").path("corners_pdf");
        double[] left = pair(corners.path("front_left"));
        double[] right = pair(corners.path("front_right"));
        double[] back = pair(corners.path("back_left"));
        if (right[0] <= left[0] || back[1] <= left[1]) throw new IllegalArgumentException("Âncoras PDF inválidas");
        frontX = left[0]; frontY = left[1];
        scaleX = width / (right[0] - left[0]);
        scaleY = depth / (back[1] - left[1]);
        rectificationShear = -scaleX * (back[0] - left[0]) / (back[1] - left[1]);
    }

    public Geometry apply(Geometry pdfGeometry, LayoutMode mode) {
        if (pdfGeometry == null) return null;
        double shear = mode == LayoutMode.RECTIFIED_LAYOUT ? rectificationShear : 0;
        return new AffineTransformation(scaleX, shear, -scaleX * frontX - shear * frontY,
                0, scaleY, -scaleY * frontY).transform(pdfGeometry);
    }

    public Coordinate apply(double x, double y, LayoutMode mode) {
        double shear = mode == LayoutMode.RECTIFIED_LAYOUT ? rectificationShear : 0;
        return new Coordinate(scaleX * (x - frontX) + shear * (y - frontY), scaleY * (y - frontY));
    }

    public Coordinate apply(JsonNode pdfPoint, LayoutMode mode) {
        double[] point = pair(pdfPoint);
        return apply(point[0], point[1], mode);
    }

    /** Owner points are in the original metric layout; invert to PDF before choosing a layout. */
    public Coordinate fromOriginalMetric(double x, double y, LayoutMode mode) {
        return apply(frontX + x / scaleX, frontY + y / scaleY, mode);
    }

    private static double[] pair(JsonNode node) {
        if (!node.isArray() || node.size() < 2 || !node.get(0).isNumber() || !node.get(1).isNumber())
            throw new IllegalArgumentException("Coordenada PDF obrigatória ausente");
        return new double[] {node.get(0).asDouble(), node.get(1).asDouble()};
    }
}
