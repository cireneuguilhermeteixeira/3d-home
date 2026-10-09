package br.com.casa628.geometry;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;

class OpeningSemanticsTest {
    private final GeometryFactory factory = new GeometryFactory();

    @Test void windowLabelsDoNotBecomeDoorsAndUnlabelledCandidatesStayUnknown() {
        assertEquals("WINDOW", OpeningSemantics.type("JANELA VIDRO"));
        assertEquals("WINDOW", OpeningSemantics.type("JANELA MADEIRA ABRIR"));
        assertEquals("WINDOW", OpeningSemantics.type("JANELA BASCULANTE"));
        assertEquals("DOOR", OpeningSemantics.type("PORTA DE MADEIRA"));
        assertEquals("GATE", OpeningSemantics.type("PORTÃO METALICO"));
        assertNull(OpeningSemantics.type("ARQ-POR-002"));
        var annotation = factory.createPoint(new Coordinate(8.1, 8.55));
        var candidates = Map.<String, org.locationtech.jts.geom.Geometry>of(
                "near-window", factory.createLineString(new Coordinate[] {new Coordinate(8.3, 8.5), new Coordinate(8.3, 9.5)}),
                "far-symbol", factory.createLineString(new Coordinate[] {new Coordinate(4, 3), new Coordinate(5, 3)}));
        assertEquals("near-window", OpeningSemantics.nearestCandidate(annotation, candidates, 0.75));
        assertNull(OpeningSemantics.nearestCandidate(factory.createPoint(new Coordinate(1, 1)), candidates, 0.75));
    }

    @Test void heightAndSillCodesAreAppliedOnlyInTheirContext() {
        assertEquals("HEIGHT", OpeningSemantics.measurementRole("WINDOW", "H", "h:1,20m"));
        assertEquals("SILL", OpeningSemantics.measurementRole("WINDOW", "PD", "PD:0,96m"));
        assertNull(OpeningSemantics.measurementRole("DOOR", "PD", "PD:0,96m"));
        assertNull(OpeningSemantics.measurementRole("WINDOW", "PDL", "PDL:2,80m"));
        assertNull(OpeningSemantics.measurementRole("WINDOW", "H", "h: BANDEIROLA:0,20m"));
    }
}
