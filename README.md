# Casa 628 — visualização 3D

Visualizador da planta arquitetônica a partir de `casa628_geometrias_semanticas_v2.json`. O backend importa o arquivo para PostgreSQL/PostGIS e expõe a cena em `GET /api/house/scene`. O frontend React mostra a planta superior e um modelo 3D navegável.

## Iniciar

Requisitos: Java 21+, Maven, Node.js 20+, npm e Docker com Compose.

1. Inicie o PostGIS na porta local **5433**:

   ```bash
   docker compose up -d
   ```

2. Em outro terminal, inicie o backend apontando para o JSON da planta:

   ```bash
   cd backend
   HOUSE_IMPORT_FILE=/caminho/para/casa628_geometrias_semanticas_v2.json mvn spring-boot:run
   ```

   Neste ambiente, o arquivo foi encontrado em `/home/cdearaujo/Downloads/casa628_geometrias_semanticas_v2.json`.
   O importador executa ao iniciar, valida os IDs e substitui os registros anteriores do mesmo projeto em uma transação. Preserva o JSON, as geometrias, os grupos semânticos, as evidências do proprietário, os textos e as medições em tabelas de origem separadas das entidades derivadas. Reiniciar com o mesmo arquivo não cria duplicatas. Após a primeira importação, `HOUSE_IMPORT_FILE` pode ser omitido.

3. Em outro terminal, inicie o frontend e abra **http://localhost:5173**:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Use **Vista superior**, **Vista 3D** e **Centralizar**. Arraste para girar, use o botão direito para mover e a roda para aproximar. A vista 3D também pode ser aberta diretamente em `http://localhost:5173/?view=3d`. Os marcadores **1–6** vêm das anotações do desenho e servem para localizar correções por ambiente. Eles ainda não definem os limites ou nomes dos cômodos.

O seletor **Original** preserva a inclinação visual do PDF; **Retificada** aplica o cisalhamento da calibração afim do JSON. A inclinação no PDF, por si só, não comprova a forma física exata do terreno. A API mantém `GET /api/house/scene`, com `?layout=ORIGINAL_LAYOUT` (padrão) ou `?layout=RECTIFIED_LAYOUT`.

## Configuração

| Variável | Padrão | Uso |
| --- | --- | --- |
| `DB_URL` | `jdbc:postgresql://localhost:5433/casa628` | Conexão PostGIS |
| `DB_USER` / `DB_PASSWORD` | `casa628` / `casa628` | Credenciais locais |
| `HOUSE_IMPORT_FILE` | vazio | Caminho do JSON a importar na inicialização |
| `HOUSE_WALL_MIN_LENGTH` | `0.35` m | Comprimento mínimo de uma face candidata |
| `HOUSE_WALL_MIN_THICKNESS` / `HOUSE_WALL_MAX_THICKNESS` | `0.08` / `0.35` m | Faixa de separação entre faces de alvenaria |
| `HOUSE_WALL_ANGLE_DEGREES` | `3`° | Diferença angular máxima entre faces |
| `HOUSE_WALL_MIN_OVERLAP_RATIO` | `0.8` | Sobreposição mínima em relação à face mais curta |
| `HOUSE_WALL_ENDPOINT_TOLERANCE` | `0.45` m | Desencontro máximo das extremidades de faces de comprimento similar |
| `HOUSE_WALL_CORNER_SNAP` | `0.15` m | Ajuste máximo de encontros entre eixos |
| `HOUSE_OPENING_ANNOTATION_DISTANCE` | `0.75` m | Busca de geometria próxima ao texto da abertura |
| `HOUSE_OPENING_WALL_DISTANCE` | `0.3` m | Busca de parede próxima à abertura |
| `VITE_VISUAL_DOOR_HEIGHT` | `2.1` m | Altura provisória de folha de porta sem cota oficial; apenas frontend |

## Alcance dos dados

O JSON real contém 1.096 caminhos vetoriais, 35 grupos semânticos, 6 marcadores de cômodo e 69 referências de altura. O backend reconstrói paredes a partir de pares de faces de alvenaria, grava os eixos, espessuras e IDs dos caminhos de origem em tabelas derivadas do PostGIS e reprocessa o mesmo projeto sem duplicatas. As aberturas preservam suas referências de anotação, texto, caminho e medida. `UNKNOWN_OPENING` e `ANNOTATION_ONLY` indicam evidência insuficiente para abrir um vão. Algumas paredes ainda podem aparecer apenas como linha quando não existe um segundo contorno confiável; os marcadores numéricos permitem apontar esses locais.

Alturas desconhecidas ficam `null` no banco e na API. A visualização 3D usa 2,80 m apenas como altura provisória de parede e 2,10 m para portas sem altura anotada. Uma medida `PDL`, `PDV`, `PDF` ou `PDT` não vira automaticamente altura de porta ou parede próxima. `PD` vira peitoril apenas no contexto de janela. A cozinha é identificada pelo marcador 3 fornecido no JSON. Sua janela basculante e a porta contígua têm spans separados; a janela do cômodo 5 conserva peitoril e bandeirola; três janelas de madeira continuam vinculadas. Oito das nove janelas têm vínculo geométrico; a janela de vidro `ann-014` permanece pendente porque a parede superior não foi consolidada. Quatro portas têm vínculo geométrico: uma anotada, a porta da cozinha indicada pelo proprietário e duas reconhecidas por folha retangular junto a uma interrupção de parede. Os dois portões de correr e os três portões metálicos têm spans candidatos e painéis visuais. O portão metálico superior foi separado do vão de `ann-014` pela verificação das ombreiras e da janela anotada. Das 69 cotas, 26 estão ligadas a anotações de aberturas e 24 dessas têm vínculo geométrico. O modo CAD mostra os traços originais; o modo 3D extruda somente paredes reconstruídas. Os marcadores 1–6 têm status `REFERENCE_MARKER`, não representam cômodos reconstruídos.

O PDF original foi encontrado em `/home/cdearaujo/Downloads/CASA 628_FORTALEZA-CE-Model.pdf`. A vista superior foi comparada visualmente com ele quanto ao perímetro e à inclinação. A associação de cada parede e abertura ainda deve ser revisada por ambiente com as referências 1–6.

## Verificar

```bash
cd backend && mvn test
cd ../frontend && npm run build
cd .. && curl -sS http://localhost:8080/api/house/scene -o /tmp/casa628-v2-scene.json
node scripts/validate-scene.mjs /tmp/casa628-v2-scene.json
```
