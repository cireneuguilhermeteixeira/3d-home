# Implementar visualização 3D da Casa 628 com Three.js e PostGIS

## Objetivo

Implemente uma aplicação capaz de importar os dados geométricos da minha planta arquitetônica e renderizar a casa inteira em 3D, utilizando Three.js.

A prioridade é **visualizar a casa completa em 3D, com paredes, muros e divisões internas**, de forma simples e funcional.

Quero conseguir visualizar a casa de cima, como uma planta 2D, mas também inclinar e girar a câmera para enxergar as alturas das paredes.

Não implemente funcionalidades avançadas de edição, navegação interna, paginação espacial ou múltiplos endpoints neste momento.

Antes de implementar, analise o projeto existente, suas dependências e convenções. Adapte a solução à arquitetura já utilizada.

## 1. Tecnologias

**Backend:**
- Java + Spring Boot 4.
- PostgreSQL + PostGIS.
- Jackson para JSON.
- JTS Topology Suite para processamento geométrico.
- Spring JDBC ou Hibernate Spatial, conforme o padrão do projeto.

**Frontend:**
- React + TypeScript.
- Three.js.
- React Three Fiber.
- @react-three/drei.

Não utilize Python.

## 2. Fonte de dados

Utilize exclusivamente o arquivo `casa628_geometrias.json`, que contém os elementos vetoriais extraídos da planta arquitetônica original.

O arquivo já possui coordenadas locais em metros, calibradas aproximadamente para um terreno de:

- Largura: 12 metros.
- Profundidade: 33 metros.
- Área: 396 m².

Sua estrutura contém campos como:

- `project`
- `drawing`
- `site`
- `paths`
- `vertices`
- `texts`
- `measurements`

Os objetos de `paths` possuem, entre outros:

- `id`
- `layer`
- `candidate_class`
- `commands`
- `geom_local`
- `geom_pdf`

As geometrias locais já estão representadas em metros.

**Não recalibre as coordenadas desnecessariamente.**

O JSON contém primitivas vetoriais, mas não possui todas as paredes e cômodos identificados semanticamente. Essa distinção deve ser respeitada.

## 3. Importação no PostgreSQL

Implemente uma rotina Java para:

1. Ler o JSON com Jackson.
2. Validar sua estrutura.
3. Persistir o projeto e o terreno.
4. Persistir os caminhos e suas geometrias no PostGIS.
5. Preservar as camadas e identificadores originais.
6. Persistir as alturas encontradas.
7. Evitar registros duplicados em importações repetidas.

A importação poderá ser executada através de um comando de inicialização ou serviço administrativo interno.

**Não é necessário criar um endpoint HTTP para importar o arquivo neste MVP.**

Utilize o `schema.sql` existente como referência, adaptando-o apenas quando necessário.

## 4. Reconstrução da planta

Crie um serviço Java responsável por transformar os caminhos vetoriais importados em dados adequados ao Three.js.

Utilize JTS para:

- Processar linhas e segmentos.
- Identificar conexões entre segmentos.
- Detectar possíveis paredes.
- Agrupar segmentos pertencentes ao mesmo alinhamento.
- Reconhecer candidatos a cômodos.
- Preservar curvas e aberturas relevantes.
- Evitar sobreposição de paredes duplicadas.

Priorize as camadas do AutoCAD relacionadas à alvenaria e estruturas arquitetônicas.

As primitivas que não puderem ser classificadas como paredes deverão continuar disponíveis para representação como linhas vetoriais.

**Não invente paredes para preencher regiões desconhecidas.**

### Altura das paredes

Quando houver altura identificada e corretamente associada, utilize o valor presente no PDF.

Caso contrário, permita utilizar uma altura visual provisória de 2,80 m, configurável.

Essa altura provisória deve ser identificada como estimativa e nunca substituir a medida original no banco.

Utilize também as espessuras reais quando identificadas; caso contrário, permita uma espessura visual padrão configurável.

## 5. API REST

Para esta primeira versão, implemente apenas um endpoint de leitura:

`GET /api/house/scene`

O endpoint deverá retornar todas as informações necessárias para renderizar a casa inteira.

Estrutura conceitual:

```json
{
  "site": {
    "width": 12,
    "depth": 33
  },
  "walls": [],
  "lines": [],
  "rooms": [],
  "openings": [],
  "measurements": []
}
```

As paredes identificadas deverão conter:

- ID.
- Posição inicial e final.
- Comprimento.
- Altura.
- Espessura.
- Status da identificação.

As linhas não classificadas deverão manter suas coordenadas originais transformadas para metros.

Crie DTOs adequados, sem expor diretamente as entidades de persistência.

O endpoint deve consultar o PostGIS, não reler o JSON a cada requisição.

**Não implemente paginação nesta versão.** A API deverá retornar a cena completa em uma única resposta.

## 6. Renderização com Three.js

Este é o principal requisito do MVP.

Crie um componente `HouseViewer3D` responsável por consumir o endpoint e renderizar a casa inteira.

### 6.1. Geometria

Renderize:

- Terreno de 12 × 33 metros.
- Paredes externas e internas identificadas.
- Muros identificados.
- Divisões arquitetônicas.
- Aberturas identificadas, quando houver dados suficientes.
- Linhas vetoriais ainda não classificadas.

As paredes deverão possuir volume tridimensional, com comprimento, altura e espessura.

Utilize geometrias extrudadas ou `BoxGeometry` quando apropriado.

O modelo deve manter as proporções reais das coordenadas.

Mapeie as coordenadas locais para Three.js assim:

- X local → X do Three.js.
- Y local → Z do Three.js.
- Altura física → Y do Three.js.

O projeto deve abrir sem telhado para permitir visualizar todos os ambientes.

### 6.2. Câmera

Implemente dois modos de visualização:

**Vista superior (padrão):**

- Câmera ortográfica acima da casa.
- Enquadramento automático de todo o terreno.
- Aparência semelhante a uma planta baixa.
- Paredes renderizadas com volume real.

**Vista 3D:**

- Câmera inclinada.
- Perspectiva isométrica aproximada.
- Visualização das paredes em altura.
- Possibilidade de orbitar a câmera livremente.

Utilize `OrbitControls` para permitir:

- Rotacionar.
- Aplicar zoom.
- Movimentar a câmera.
- Retornar ao enquadramento inicial.

### 6.3. Aparência visual

Priorize uma apresentação arquitetônica moderna e limpa.

Utilize:

- Fundo neutro.
- Piso claro.
- Paredes brancas ou cinza-claro.
- Iluminação ambiente.
- Luz direcional.
- Sombras suaves.
- Grid discreto opcional.

Diferencie visualmente:

- Paredes reconhecidas.
- Paredes estimadas.
- Linhas vetoriais não classificadas.

O modelo deve ser legível tanto na vista superior quanto em perspectiva.

### 6.4. Interação

Implemente apenas:

- Zoom.
- Pan.
- Rotação.
- Botão "Vista superior".
- Botão "Vista 3D".
- Botão "Centralizar".

Não implemente editor, seleção avançada ou inspeção detalhada dos elementos nesta versão.

### 6.5. Limitação dos dados

A primeira importação contém todas as primitivas vetoriais, mas não garante que todas as paredes estejam identificadas.

Portanto:

- Sempre renderize os caminhos originais como referência espacial quando necessário.
- Gere paredes com volume somente quando houver uma interpretação geométrica suficiente.
- Diferencie as geometrias provisórias.
- Não apresente uma reconstrução incompleta como se estivesse validada.

A aplicação deve renderizar a planta completa mesmo que alguns elementos apareçam apenas como linhas, enquanto outros já possuam representação volumétrica.

## 7. Componentização

Crie uma estrutura simples e reutilizável.

Exemplo:

```text
frontend/
  components/
    HouseViewer3D.tsx
    HouseScene.tsx
    Walls3D.tsx
    Floor3D.tsx
    DrawingLines3D.tsx
    CameraControls.tsx

backend/
  importation/
    FloorPlanImportService.java
  geometry/
    GeometryProcessingService.java
  scene/
    HouseSceneService.java
    HouseSceneController.java
```

Adapte os pacotes à arquitetura existente. Não crie camadas desnecessárias.

## 8. Performance

O arquivo possui aproximadamente 1.096 caminhos vetoriais.

Essa quantidade é adequada para carregar inicialmente a cena completa.

Implemente boas práticas simples:

- Carregar os dados uma vez pela API.
- Evitar requisições repetidas desnecessárias.
- Utilizar `useMemo` nas geometrias derivadas quando apropriado.
- Reutilizar materiais.
- Evitar reconstruções completas a cada render React.
- Liberar recursos gráficos quando necessário.

Não implemente LOD, paginação espacial, streaming de geometrias ou WebSocket agora.

## 9. Critérios de aceite

A implementação estará concluída quando:

1. O JSON for importado com sucesso no PostGIS.
2. As coordenadas e geometrias forem preservadas.
3. O endpoint `/api/house/scene` retornar os dados armazenados.
4. O Three.js renderizar o desenho completo da casa.
5. Paredes identificadas forem exibidas com altura e espessura.
6. A vista superior enquadrar corretamente o terreno.
7. A vista 3D permitir perceber a altura das paredes.
8. Zoom, pan, rotação e centralização funcionarem.
9. Os elementos não classificados permanecerem visíveis como linhas.
10. A aplicação funcionar sem depender de Python.

Valide a renderização comparando a vista superior com o PDF original. Os alinhamentos, recuos e contornos deverão corresponder ao desenho.

Se o reconhecimento automático das paredes não atingir uma qualidade suficiente, entregue a visualização vetorial completa e informe quais partes ainda precisam de reconstrução semântica, em vez de criar uma casa incorreta.

## 10. Escopo futuro — Não implementar agora

Na versão 2, pretendo permitir que o usuário caminhe dentro da casa em primeira pessoa.

Nessa versão, o sistema poderá:

- Posicionar uma câmera na altura dos olhos.
- Movimentar o usuário por corredores e cômodos.
- Detectar colisões com paredes.
- Abrir portas.
- Carregar geometrias próximas à posição atual.
- Consultar o PostGIS por região ou distância.
- Utilizar carregamento espacial incremental conforme o usuário se desloca.

Prepare uma estrutura que não impeça essa evolução, mas **não implemente nenhuma dessas funcionalidades neste MVP**.

## 11. Instrução final

Implemente o MVP completo, priorizando a renderização 3D correta e funcional.

Ordem de trabalho:

1. Inspecionar o repositório e o JSON.
2. Importar os dados no PostGIS.
3. Criar o endpoint único.
4. Renderizar a geometria vetorial com Three.js.
5. Identificar e extrudar paredes quando possível.
6. Implementar câmeras superior e perspectiva.
7. Validar visualmente contra o PDF.
8. Executar testes e documentar como iniciar a aplicação.

Evite overengineering.

**O resultado principal deve ser uma página na qual eu consiga ver minha casa inteira em 3D, girar a câmera e alternar para uma vista superior que se pareça com a planta original.**
