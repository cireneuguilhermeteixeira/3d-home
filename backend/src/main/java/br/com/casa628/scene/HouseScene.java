package br.com.casa628.scene;

import java.util.List;
import tools.jackson.databind.JsonNode;

public record HouseScene(Site site, List<Wall> walls, List<DrawingLine> lines,
                         List<Object> rooms, List<Object> openings, List<JsonNode> measurements) {
    public record Site(double width, double depth, List<Point> boundary) {}
    public record Point(double x, double y) {}
    public record Wall(String id, Point start, Point end, double length, double height,
                       double thickness, String status, boolean heightEstimated, boolean thicknessEstimated) {}
    public record DrawingLine(String id, String layer, String candidateClass, List<Point> points) {}
}
