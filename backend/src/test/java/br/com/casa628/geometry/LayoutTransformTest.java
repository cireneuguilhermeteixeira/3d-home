package br.com.casa628.geometry;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class LayoutTransformTest {
    @Test void originalModePreservesPdfLeanWhileRectifiedModeRemovesIt() {
        var drawing = JsonMapper.builder().build().readTree("""
                {"calibration":{"corners_pdf":{"front_left":[204.08,132.44],
                "front_right":[435.56,132.44],"back_left":[174.8,771.2]}}}
                """);
        var transform = new LayoutTransform(drawing, 12, 33);
        var original = transform.apply(174.8, 771.2, LayoutMode.ORIGINAL_LAYOUT);
        var rectified = transform.apply(174.8, 771.2, LayoutMode.RECTIFIED_LAYOUT);
        assertEquals(-1.51788, original.x, 0.005);
        assertEquals(0, rectified.x, 0.005);
        assertEquals(33, original.y, 0.005);
        assertEquals(original.y, rectified.y, 1e-9);
    }
}
