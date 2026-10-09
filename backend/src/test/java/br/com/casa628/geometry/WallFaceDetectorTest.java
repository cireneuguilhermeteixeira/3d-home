package br.com.casa628.geometry;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;

class WallFaceDetectorTest {
    private final WallFaceDetector detector = new WallFaceDetector(0.35, 0.08, 0.35, 3, 0.8, 0.25, 0.15);

    @Test void realParallelFacesBecomeOneWallOfMeasuredThickness() {
        var first = new WallFaceDetector.Face("0ea19d86-04de-542f-b875-5fe5e97ca9f8", "ARQ-ALV-ALT",
                new Coordinate(1.5362587, 8.7847084), new Coordinate(4.4787157, 8.7847084));
        var second = new WallFaceDetector.Face("d3eee6b3-24bd-5326-b8fc-f98b91f28fb7", "ARQ-ALV-ALT",
                new Coordinate(1.5397326, 8.9954911), new Coordinate(4.4884109, 8.9954911));
        var walls = detector.detect(List.of(first, second), LayoutMode.RECTIFIED_LAYOUT);
        assertEquals(1, walls.size());
        assertEquals(0.2107827, walls.getFirst().thickness(), 0.002);
        assertEquals(2, walls.getFirst().sourcePathIds().size());
        assertEquals(8.89009975, walls.getFirst().axis().getCoordinate().y, 0.002);
    }

    @Test void splitOppositeFaceCanBePairedWithoutFillingOpeningGap() {
        var longFace = new WallFaceDetector.Face("continuous", "ARQ-ALV-ALT",
                new Coordinate(0, 0), new Coordinate(0, 3));
        var before = new WallFaceDetector.Face("before", "ARQ-ALV-ALT",
                new Coordinate(0.2, 0), new Coordinate(0.2, 1));
        var after = new WallFaceDetector.Face("after", "ARQ-ALV-ALT",
                new Coordinate(0.2, 2), new Coordinate(0.2, 3));
        var walls = detector.detect(List.of(longFace, before, after), LayoutMode.ORIGINAL_LAYOUT);
        assertEquals(2, walls.size());
        assertEquals(2, walls.stream().mapToDouble(w -> w.axis().getLength()).sum(), 0.03);
    }

    @Test void staggeredCornerFacesBecomeOneWallWhenOverlapIsSufficient() {
        var cornerDetector = new WallFaceDetector(0.35, 0.08, 0.35, 3, 0.8, 0.45, 0.15);
        var first = new WallFaceDetector.Face("0cd3c615", "ARQ-ALV-ALT",
                new Coordinate(4.2550546, 2.2504227), new Coordinate(4.2550546, 4.5256455));
        var second = new WallFaceDetector.Face("5319d200", "ARQ-ALV-ALT",
                new Coordinate(4.0746497, 2.6347925), new Coordinate(4.0746497, 4.8914144));
        var walls = cornerDetector.detect(List.of(first, second), LayoutMode.ORIGINAL_LAYOUT);
        assertEquals(1, walls.size());
        assertEquals(0.1804, walls.getFirst().thickness(), 0.002);
        assertEquals(1.89, walls.getFirst().axis().getLength(), 0.02);
    }

    @Test void proximityWithoutLongitudinalOverlapDoesNotCreateWall() {
        var first = new WallFaceDetector.Face("one", "ARQ-ALV-ALT",
                new Coordinate(0, 0), new Coordinate(1, 0));
        var second = new WallFaceDetector.Face("two", "ARQ-ALV-ALT",
                new Coordinate(1.4, 0.2), new Coordinate(2.4, 0.2));
        assertTrue(detector.detect(List.of(first, second), LayoutMode.ORIGINAL_LAYOUT).isEmpty());
    }
}
