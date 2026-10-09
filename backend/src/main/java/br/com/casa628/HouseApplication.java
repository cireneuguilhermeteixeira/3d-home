package br.com.casa628;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.beans.factory.annotation.Value;
import java.nio.file.Path;
import br.com.casa628.importation.FloorPlanImportService;

@SpringBootApplication
public class HouseApplication {
    public static void main(String[] args) { SpringApplication.run(HouseApplication.class, args); }

    @Bean ApplicationRunner importOnStartup(FloorPlanImportService importer, @Value("${house.import-file:}") String file) {
        return args -> { if (!file.isBlank()) importer.importFile(Path.of(file)); };
    }
}
