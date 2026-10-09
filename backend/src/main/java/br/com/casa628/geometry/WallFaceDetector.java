package br.com.casa628.geometry;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LineSegment;
import org.locationtech.jts.geom.LineString;

/** Pairs two complete, aligned masonry faces before creating any 3D wall. */
public final class WallFaceDetector {
    public record Face(String pathId, String layer, Coordinate a, Coordinate b) {
        double length() { return a.distance(b); }
    }
    public record Wall(String id, LineString axis, double thickness, List<String> sourcePathIds) {}
    private record Match(int left, int right, double score, double thickness, Coordinate start, Coordinate end,
                         double leftLow, double leftHigh, double rightLow, double rightHigh) {}

    private final GeometryFactory geometryFactory = new GeometryFactory();
    private final double minLength, minThickness, maxThickness, maxAngle, minOverlapRatio, endpointTolerance, cornerSnap;

    public WallFaceDetector(double minLength, double minThickness, double maxThickness, double maxAngleDegrees,
                            double minOverlapRatio, double endpointTolerance, double cornerSnap) {
        this.minLength = minLength; this.minThickness = minThickness; this.maxThickness = maxThickness;
        this.maxAngle = Math.toRadians(maxAngleDegrees); this.minOverlapRatio = minOverlapRatio;
        this.endpointTolerance = endpointTolerance; this.cornerSnap = cornerSnap;
    }

    public List<Wall> detect(List<Face> faces, LayoutMode mode) {
        List<Face> candidates = faces.stream().filter(f -> f.length() >= minLength).toList();
        List<Match> matches = new ArrayList<>();
        for (int i = 0; i < candidates.size(); i++) for (int j = i + 1; j < candidates.size(); j++) {
            Match match = compare(candidates.get(i), candidates.get(j), i, j);
            if (match != null) matches.add(match);
        }
        matches.sort(Comparator.comparingDouble(Match::score).reversed()
                .thenComparingInt(Match::left).thenComparingInt(Match::right));
        Map<Integer, List<double[]>> used = new HashMap<>();
        List<Wall> walls = new ArrayList<>();
        for (Match match : matches) {
            if (!free(used, match.left, match.leftLow, match.leftHigh) ||
                    !free(used, match.right, match.rightLow, match.rightHigh)) continue;
            used.computeIfAbsent(match.left, key -> new ArrayList<>()).add(new double[] {match.leftLow, match.leftHigh});
            used.computeIfAbsent(match.right, key -> new ArrayList<>()).add(new double[] {match.rightLow, match.rightHigh});
            Face a = candidates.get(match.left), b = candidates.get(match.right);
            List<String> ids = a.pathId.equals(b.pathId) ? List.of(a.pathId) :
                    a.pathId.compareTo(b.pathId) < 0 ? List.of(a.pathId, b.pathId) : List.of(b.pathId, a.pathId);
            String fingerprint = mode + ":" + ids + ":" + match.left + ":" + match.right;
            String id = UUID.nameUUIDFromBytes(fingerprint.getBytes(StandardCharsets.UTF_8)).toString();
            walls.add(new Wall(id, geometryFactory.createLineString(new Coordinate[] {match.start, match.end}),
                    match.thickness, ids));
        }
        return snapCorners(walls);
    }

    private static boolean free(Map<Integer, List<double[]>> used, int face, double low, double high) {
        for (double[] interval : used.getOrDefault(face, List.of()))
            if (Math.min(high, interval[1]) - Math.max(low, interval[0]) > 0.02) return false;
        return true;
    }

    private Match compare(Face a, Face b, int i, int j) {
        if (!a.layer.equals(b.layer)) return null;
        double al = a.length(), bl = b.length();
        double ux = (a.b.x - a.a.x) / al, uy = (a.b.y - a.a.y) / al;
        double vx = (b.b.x - b.a.x) / bl, vy = (b.b.y - b.a.y) / bl;
        double cosine = Math.abs(ux * vx + uy * vy);
        if (cosine < Math.cos(maxAngle)) return null;
        double offsetA = cross(ux, uy, b.a.x - a.a.x, b.a.y - a.a.y);
        double offsetB = cross(ux, uy, b.b.x - a.a.x, b.b.y - a.a.y);
        double thickness = (Math.abs(offsetA) + Math.abs(offsetB)) / 2;
        if (thickness < minThickness || thickness > maxThickness || offsetA * offsetB <= 0) return null;
        if (Math.abs(offsetA - offsetB) > Math.max(0.04, thickness * 0.2)) return null;
        double bp = dot(ux, uy, b.a.x - a.a.x, b.a.y - a.a.y);
        double bq = dot(ux, uy, b.b.x - a.a.x, b.b.y - a.a.y);
        double low = Math.min(bp, bq), high = Math.max(bp, bq);
        double start = Math.max(0, low), end = Math.min(al, high);
        double overlap = end - start;
        if (overlap < minLength || overlap / Math.min(al, bl) < minOverlapRatio) return null;
        double endpointMismatch = Math.max(Math.abs(low), Math.abs(high - al));
        boolean splitFace = Math.max(al, bl) > Math.min(al, bl) * 1.3;
        if (splitFace) {
            boolean shorterInside = al > bl ? low >= -0.1 && high <= al + 0.1 : low <= 0.1 && high >= al - 0.1;
            if (!shorterInside || overlap / Math.min(al, bl) < 0.9) return null;
        } else if (endpointMismatch > endpointTolerance) return null;
        Coordinate first = midpointOnFaces(a, b, ux, uy, start);
        Coordinate last = midpointOnFaces(a, b, ux, uy, end);
        double score = overlap / Math.max(al, bl) - (splitFace ? 0.05 : endpointMismatch * 0.3) - Math.abs(offsetA - offsetB);
        double bvx = (b.b.x-b.a.x)/bl, bvy = (b.b.y-b.a.y)/bl;
        double bFirst = dot(bvx, bvy, a.a.x+ux*start-b.a.x, a.a.y+uy*start-b.a.y);
        double bLast = dot(bvx, bvy, a.a.x+ux*end-b.a.x, a.a.y+uy*end-b.a.y);
        return new Match(i, j, score, thickness, first, last, start, end,
                Math.max(0, Math.min(bFirst, bLast)), Math.min(bl, Math.max(bFirst, bLast)));
    }

    private static Coordinate midpointOnFaces(Face a, Face b, double ux, double uy, double station) {
        double ax = a.a.x + ux * station, ay = a.a.y + uy * station;
        LineSegment other = new LineSegment(b.a, b.b);
        Coordinate nearest = other.closestPoint(new Coordinate(ax, ay));
        return new Coordinate((ax + nearest.x) / 2, (ay + nearest.y) / 2);
    }

    private List<Wall> snapCorners(List<Wall> source) {
        List<Wall> result = new ArrayList<>();
        for (int i = 0; i < source.size(); i++) {
            Wall wall = source.get(i);
            Coordinate[] ends = wall.axis.getCoordinates();
            for (int end = 0; end < 2; end++) {
                Coordinate candidate = ends[end];
                for (int j = 0; j < source.size(); j++) {
                    if (i == j) continue;
                    Coordinate[] other = source.get(j).axis.getCoordinates();
                    Coordinate near = candidate.distance(other[0]) < candidate.distance(other[1]) ? other[0] : other[1];
                    if (candidate.distance(near) > cornerSnap) continue;
                    double angle = angle(ends[0], ends[1], other[0], other[1]);
                    if (angle < Math.toRadians(20)) continue;
                    Coordinate crossing = new LineSegment(ends[0], ends[1]).lineIntersection(new LineSegment(other[0], other[1]));
                    if (crossing != null && crossing.distance(candidate) <= cornerSnap && crossing.distance(near) <= cornerSnap) {
                        ends[end] = crossing; break;
                    }
                }
            }
            result.add(new Wall(wall.id, geometryFactory.createLineString(ends), wall.thickness, wall.sourcePathIds));
        }
        return result;
    }

    private static double angle(Coordinate a, Coordinate b, Coordinate c, Coordinate d) {
        double ax = b.x - a.x, ay = b.y - a.y, bx = d.x - c.x, by = d.y - c.y;
        return Math.acos(Math.min(1, Math.abs((ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by)))));
    }
    private static double cross(double ax, double ay, double bx, double by) { return ax * by - ay * bx; }
    private static double dot(double ax, double ay, double bx, double by) { return ax * bx + ay * by; }
}
