package br.com.casa628.scene;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import br.com.casa628.geometry.LayoutMode;

@RestController
@RequestMapping("/api/house")
public class HouseSceneController {
    private final HouseSceneService service;
    public HouseSceneController(HouseSceneService service) { this.service = service; }
    @GetMapping("/scene") public HouseScene scene(@RequestParam(defaultValue = "ORIGINAL_LAYOUT") LayoutMode layout) {
        return service.getScene(layout);
    }
}
