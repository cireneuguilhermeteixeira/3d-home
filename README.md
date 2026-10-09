# Casa 628 — visualização 3D

Visualizador da planta arquitetônica a partir de `casa628_geometrias.json`. O backend importa o arquivo para PostgreSQL/PostGIS e expõe a cena em `GET /api/house/scene`. O frontend React mostra a planta superior e um modelo 3D navegável.

## Iniciar

Requisitos: Java 21+, Maven, Node.js 20+, npm e Docker com Compose.

1. Inicie o PostGIS na porta local **5433**:

   ```bash
   docker compose up -d
   ```

2. Em outro terminal, inicie o backend apontando para o JSON da planta:

   ```bash
   cd backend
   HOUSE_IMPORT_FILE=/caminho/para/casa628_geometrias.json mvn spring-boot:run
   ```

   Neste ambiente, o arquivo foi encontrado em `/home/cdearaujo/Downloads/casa628_geometrias.json`.
   O importador executa ao iniciar, valida os IDs, substitui os registros anteriores do mesmo projeto em uma transação e mantém o JSON original, camadas, geometrias e medições. Reiniciar com o mesmo arquivo não cria duplicatas. Após a primeira importação, `HOUSE_IMPORT_FILE` pode ser omitido.

3. Em outro terminal, inicie o frontend e abra **http://localhost:5173**:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Use **Vista superior**, **Vista 3D** e **Centralizar**. Arraste para girar, use o botão direito para mover e a roda para aproximar. A vista 3D também pode ser aberta diretamente em `http://localhost:5173/?view=3d`.

## Configuração

| Variável | Padrão | Uso |
| --- | --- | --- |
| `DB_URL` | `jdbc:postgresql://localhost:5433/casa628` | Conexão PostGIS |
| `DB_USER` / `DB_PASSWORD` | `casa628` / `casa628` | Credenciais locais |
| `HOUSE_IMPORT_FILE` | vazio | Caminho do JSON a importar na inicialização |
| `HOUSE_WALL_HEIGHT` | `2.8` | Altura visual quando não existe medida vinculada |
| `HOUSE_WALL_THICKNESS` | `0.15` | Espessura visual quando não existe medida vinculada |
| `HOUSE_MIN_WALL_LENGTH` | `0.5` | Comprimento mínimo para extrusão de candidato |

## Alcance dos dados

O arquivo real contém 1.096 caminhos, dos quais 1.094 têm geometria espacial, e 69 referências de altura. Essas referências estão sem vínculo com elementos (`UNASSIGNED`), portanto nenhuma foi aplicada às paredes. Os 146 segmentos volumétricos atuais são **candidatos geométricos**, com altura e espessura visuais estimadas; os traços menores e os elementos sem classificação permanecem como linhas. Cômodos e aberturas não são apresentados como identificados sem dados suficientes. As coordenadas locais são aproximadas, conforme a calibração do próprio JSON.

O PDF original não estava disponível neste repositório nem em `Downloads`; a comparação visual final com a planta original ainda precisa ser feita. O endpoint e as duas vistas foram validados com o JSON real.

## Verificar

```bash
cd backend && mvn test
cd ../frontend && npm run build
```
