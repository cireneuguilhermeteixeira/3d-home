package br.com.casa628.scene;

import java.util.List;
import tools.jackson.databind.JsonNode;

public record HouseScene(Site site, List<Wall> walls, List<DrawingLine> lines,
                         List<RoomMarker> rooms, List<Opening> openings, List<Measurement> measurements,
                         List<Element> elements) {
    public record Site(double width, double depth, List<Point> boundary, String layoutMode) {}
    public record Point(double x, double y) {}
    public record RoomMarker(String id, String number, String name, Point center,
                             String status, String sourceTextId, String roomType) {}
    public record Wall(String id, Point start, Point end, double length, Double height,
                       double thickness, String status, boolean heightEstimated, boolean thicknessEstimated,
                       List<String> sourcePathIds, String heightSourceId) {}
    public record Opening(String id, String type, String status, String wallId, Point center,
                          Double positionAlongWall, Double width, Double height, Double sillHeight,
                          List<String> sourcePathIds, List<String> sourceTextIds, List<String> measurementIds,
                          String annotationId, String subtype, Double transomHeight, Point spanStart, Point spanEnd) {}
    public record Measurement(String id, String code, Double valueM, JsonNode original,
                              List<MeasurementLink> associations) {}
    public record MeasurementLink(String entityType, String entityId, String role, String status) {}
    public record Element(String id, String type, String status, Point center, Double height,
                          String heightSourceId, List<String> sourceTextIds) {}
    public record DrawingLine(String id, String sourcePathId, String layer, String candidateClass,
                              boolean representedByWall, List<Point> points) {}
}
