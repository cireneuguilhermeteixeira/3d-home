# Forma Studio — implementação

Legenda: `[ ]` pendente, `[-]` em andamento, `[x]` concluído. Uma etapa só fica concluída após implementação e verificação; integrações sem credenciais permanecem pendentes.

## Fase 0 — inspeção e preservação

- [x] Inspeção e preservação do projeto anterior. Aceite: estrutura, algoritmos, protótipo, banco, deploy e dados inventariados; referência Git criada. Verificação: `git branch --list safety-pre-nextjs-20261015`, cópia do protótipo e inventário abaixo.

## Fase 1 — reconstrução

- [x] Migração para Next.js. Aceite: App Router executa sem Java/Vite. Verificação: `npx tsc --noEmit`; servidor Next.js e `POST /api/projects` responderam localmente. Arquivos: `src/app`, `package.json`, `next.config.ts`; `backend/` e `frontend/` removidos após arquivamento.
- [x] Migração da interface Forma Studio v2. Aceite: onboarding/editor responsivos com identidade do protótipo. Verificação: capturas reais no Chrome em desktop e celular, além do editor autenticado nas vistas CAD e 3D. Arquivos: `src/app/globals.css`, `src/components/NewProject.tsx`, `src/components/ProjectEditor.tsx`.
- [ ] Deploy Vercel. Aceite: build e publicação verificados.

## Fase 2 — banco e projeto

- [x] Configuração PostgreSQL/PostGIS. Aceite: migração e consulta espacial reais. Verificação: `npm run db:migrate` no container local e consulta `spatial_elements` no teste HTTP. Arquivos: `db/schema.sql`, `compose.yaml`, `scripts/migrate.ts`.
- [x] Modelagem do JSON arquitetônico. Aceite: schema versionado com raw CAD, arquitetura e design separados. Verificação: testes `cad.test.ts`; arquivo `src/lib/model.ts`. Limite: alguns campos de elevação CAD ainda não são interpretados.
- [x] Persistência dos projetos. Aceite: criar, abrir e verificar propriedade. Verificação: teste HTTP/PostGIS `project-flow.test.ts`; arquivos `src/lib/db.ts`, rotas em `src/app/api/projects`.
- [x] Versionamento e salvamento. Aceite: draft automático, revisão imutável, conflito e restauração. Verificação: teste HTTP para salvar, recarregar e restaurar. UI usa debounce de 850 ms; arquivos `src/stores/editor-store.ts`, `ProjectEditor.tsx`.

## Fase 3 — CAD

- [-] Upload de arquivos CAD. Aceite: DWG/DXF válidos vão direto ao armazenamento de objetos. Contrato Vercel Blob implementado em `upload/route.ts`; sem `BLOB_READ_WRITE_TOKEN` para testar a transferência real.
- [-] Conversão DWG/DXF para JSON. Aceite: DWG real via integração externa, DXF via parser, escala ambígua solicitada. DXF validado com fixture real de sintaxe; CloudConvert DWG→DXF implementado, porém sem chave e sem DWG de teste. Arquivos `src/lib/cad.ts`, `cloudconvert.ts`, `import/route.ts`.

## Fase 4 — visualização

- [x] Visualização CAD. Aceite: top view e seleção dos ambientes no mesmo JSON. Verificação visual no Chrome com DXF de teste; o clique no piso usa raycasting e a lista lateral permite selecionar o cômodo. Arquivos: `ProjectViewer.tsx`, `legacy/HouseScene.tsx`.
- [x] Identificação dos ambientes. Aceite: nome e tipo editáveis, sem inferência inventada. Verificação: polilinha fechada normalizada no teste CAD e nome/tipo persistidos no teste HTTP. Arquivos: `operations.ts`, `ProjectEditor.tsx`.
- [-] Reconstrução 3D. Aceite: paredes consolidadas, pisos e aberturas proporcionais. Pareamento de faces portado e testado; extração completa de aberturas e validação visual pendentes.
- [-] Navegação em primeira pessoa. Aceite: teclado/mouse, colisão e seleção. Controles portados; entrada na vista conferida no Chrome. Posição inicial evita móveis e colisão/direção têm teste unitário; ainda falta teste interativo de movimento em plantas variadas.

## Fase 5 — decoração

- [-] Biblioteca de móveis e materiais. Aceite: modelos reais licenciados e preços conhecidos ou em branco. Dois GLB Khronos e licenças em `public/assets`; falta validar exibição e thumbnails.
- [x] Edição manual dos elementos. Aceite: operações atualizam JSON, cena e draft. Verificação: teste HTTP de cor, piso, inclusão, movimento e rotação; `operations.ts`, `editor-store.ts`. Limite: seleção via clique requer validação visual.

## Fase 6 — IA

- [-] Integração com OpenAI. Aceite: Structured Outputs retorna operações válidas com contexto reduzido. Rota e schema implementados; falta `OPENAI_API_KEY` e teste de contrato externo.
- [-] Edição por linguagem natural. Aceite: operações determinísticas e entidades verificadas. Motor determinístico testado; interpretação real depende da chave.

## Fase 7 — fotorrealismo

- [-] Geração fotorrealista. Aceite: imagem por ação explícita, referência de câmera, persistência e download. Rotas e UI implementadas; falta credencial OpenAI/Blob para teste real.

## Fase 8 — orçamento e entrega

- [x] Orçamento de materiais e móveis. Aceite: quantitativos e CSV sem preços inventados. Verificação: `budget()` no teste unitário e download CSV no fluxo HTTP/PostGIS. Paredes sem altura conhecida não recebem área inventada; preços não cadastrados ficam vazios.
- [-] Testes automatizados. Aceite: fluxos principais e contratos externos verificados. `npm test` com 8/8 passou contra o build de produção, inclusive HTTP/PostGIS, revisão, orçamento CSV, CAD, navegação inicial, contrato CloudConvert e histórico de edição; contratos pagos DWG/OpenAI/Blob ainda sem credenciais externas.
- [x] Documentação final. Aceite: README com configuração, execução, variáveis, deploy e limitações reais. Arquivo `README.md` atualizado; funcionalidades não verificadas continuam descritas como pendentes.

## Registro de execução

- 2026-10-15: inspeção iniciada; branch de segurança criada e protótipo não rastreado preservado em `/tmp`. Nenhuma funcionalidade marcada como concluída antes dos testes.
- Inventário: `frontend/src/components/HouseScene.tsx` já contém câmera CAD, extrusão de paredes pareadas, recortes, caixilhos e iluminação; `WalkControls.tsx`/`walkCollision.ts` contêm navegação e colisão. `WallFaceDetector.java` pareia faces alinhadas com faixas de espessura e sobreposição, rejeita uso duplicado e ajusta cantos; `OpeningSemantics.java` exige anotação explícita e dá significado a `H` e `PD`, preservando `PDL/PDV/PDF`. `LayoutTransform.java` contém calibração afim. `ArchitecturalProcessingService.java` acrescenta vínculos e correções específicas da Casa 628. O SQL atual é específico para uma casa e será substituído por snapshots JSONB e projeções PostGIS. `compose.yaml` pode manter PostGIS local com novo schema. O único dado rastreado de correção é `casa628_owner_corrections.json`; o protótipo não rastreado contém imagens de referência. Nenhum DWG/DXF ou GLB real está no repositório. Deploy Vercel anterior não existe.
- 2026-10-15: fases 1–2 implementadas e verificadas localmente; fase 3 DXF validada com fixture; fase 4/5 integradas ao editor; rotas de IA, imagem e orçamento criadas. Testes: `npm test` (4/4 com PostgreSQL/PostGIS), `npx tsc --noEmit`. Java/Vite removidos. Protótipo arquivado em `design-reference/forma_studio_v2`, correções antigas em `legacy/`. Limitações externas e visuais descritas nos itens em andamento.
- 2026-10-16: inspeção visual do onboarding feita no Chrome local. Iniciada a extração conservadora de portas, janelas e portões por evidência explícita no CAD, incluindo códigos arquitetônicos; serão rejeitadas associações ambíguas.
- 2026-10-16: capturas no Chrome validaram CAD, maquete 3D e poltrona GLB real. Removido o portal HTML da cena que causava erro React ao trocar de vista; ajustado enquadramento da câmera. Extração DXF de janela explícita testada com `h`, `PD`, `PDL`, `PDV` e `PDF`; ainda faltam plantas variadas e aberturas mais complexas. Testes locais: `npm run build`, `npm test` (5/5 com PostGIS e CSV), `git diff --check`.
- 2026-10-16: cor da parede conectada aos sólidos 3D e confirmada no Chrome com edição persistida; câmera inicial da primeira pessoa afastada de móveis. Plano antigo Java arquivado em `legacy/PLAN.md`. Validação final: `npm run build`, `npm test` (6/6 contra `next start` com PostGIS), `git diff --check`. Projeto/sessão temporários da verificação visual removidos do banco.
- 2026-10-16: contrato da CloudConvert verificado com mock apenas da chamada externa: `import/url` assinado, conversão DWG→DXF, exportação e status (`tests/cloudconvert.test.ts`). O editor consulta o job automaticamente a cada cinco segundos e encerra a consulta em caso de erro. Verificação: `npm test` (6 unitários/contrato), `npx tsc --noEmit`, `git diff --check`. DWG real ainda depende de chave, Blob e arquivo de teste.
- 2026-10-16: fluxo de operações retornadas pela IA agora usa o mesmo histórico local de edição, preserva a vista/seleção e permite desfazer/refazer (`editor-store.ts`, `ProjectEditor.tsx`, `editor-store.test.ts`). Verificação final: `npm run build`, `npm test` (8/8 contra `next start`/PostGIS na porta 3100), `git diff --check`. Não houve chamada OpenAI real por falta de credencial.
