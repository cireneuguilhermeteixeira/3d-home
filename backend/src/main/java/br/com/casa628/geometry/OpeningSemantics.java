package br.com.casa628.geometry;

import java.util.Locale;
import java.util.Map;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.Point;

/** Explicit labels determine type; proximity alone never turns a symbol into a door. */
public final class OpeningSemantics {
    private OpeningSemantics() {}

    public static String type(String text) {
        String upper = text.toUpperCase(Locale.ROOT);
        if (upper.contains("JANELA")) return "WINDOW";
        if (upper.contains("PORTÃO") || upper.contains("PORTAO")) return "GATE";
        if (upper.contains("PORTA")) return "DOOR";
        return null;
    }

    public static String measurementRole(String type, String code, String text) {
        if (code.equals("H") && !text.toUpperCase(Locale.ROOT).contains("BANDEIROLA")) return "HEIGHT";
        if (code.equals("PD") && type.equals("WINDOW")) return "SILL";
        return null;
    }

    public static String nearestCandidate(Point annotation, Map<String, Geometry> candidates, double maxDistance) {
        String nearest = null;
        double first = Double.POSITIVE_INFINITY, second = Double.POSITIVE_INFINITY;
        for (Map.Entry<String, Geometry> entry : candidates.entrySet()) {
            double distance = entry.getValue().distance(annotation);
            if (distance < first) { second = first; first = distance; nearest = entry.getKey(); }
            else if (distance < second) second = distance;
        }
        return first <= maxDistance && second - first >= 0.05 ? nearest : null;
    }
}
