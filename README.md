# Forma Studio

Aplicação Next.js para importar plantas CAD, revisar ambientes, explorar uma maquete Three.js e editar um projeto arquitetônico versionado. Landing, onboarding, editor e modais reutilizam o CSS, os ícones SVG e a estrutura visual de `design-reference/forma_studio_v2`.

## Estado atual

O fluxo local de criação, normalização **DXF/DWG**, edição, salvamento, restauração e exportação CSV foi implementado e testado. O DWG é lido como binário pelo **LibreDWG em WebAssembly**, sem API externa de conversão. Um DWG real de teste passou pelo upload local, foi convertido para JSON e recuperado do banco. A transferência pelo Blob na Vercel e plantas arquitetônicas variadas ainda precisam de validação. A interpretação OpenAI e a geração de imagem precisam das credenciais listadas abaixo. Consulte [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) para o estado preciso de cada requisito.

O modelo arquitetônico preserva as entidades CAD originais em `sourceCad.rawEntities`, mantém paredes/ambientes/aberturas interpretados em campos próprios e móveis/materiais em dados de design. As geometrias usam metros quando a unidade do CAD é conhecida. Se `$INSUNITS` não for confiável, a interface pede uma medida de referência antes de construir a maquete.

## Experimentar sem arquivo CAD

Na página inicial, clique em **Explorar demo**. Isso cria no PostgreSQL um projeto de demonstração editável com oito ambientes em uma planta de 12 × 33 m, paredes, portas, janelas e dois móveis GLB. Selecione um ambiente na vista CAD, use **Maquete 3D** ou **Primeira pessoa**, clique na cena para ativar a navegação e mova-se com **WASD** (mouse para olhar). As alterações usam o mesmo rascunho e o botão **Salvar alterações** dos projetos importados. A demonstração não se apresenta como CAD importado.

O onboarding tem quatro etapas. As opções de estética são checkboxes reais; **Continuar** avança para preferências. Para testar pelo endereço `127.0.0.1`, `next.config.ts` permite essa origem de desenvolvimento, necessária para a hidratação React no Next 16.

## Executar localmente

Requer Node.js 20.9+ e Docker para o PostGIS local.

```bash
npm ci
docker compose up -d
cp .env.example .env.local
# Preencha DATABASE_URL e as credenciais desejadas em .env.local
npm run db:migrate
npm run dev
```

`DATABASE_URL=postgresql://forma:forma@localhost:5433/forma` corresponde ao `compose.yaml`. Abra `http://localhost:3000`. Em `npm run dev`, o upload CAD funciona **sem Blob**: se não houver store configurada, o original fica em `.forma-local-files/`, diretório ignorado pelo Git. Na Vercel, conecte uma store **private** do Vercel Blob; o armazenamento local não é usado em produção. Em deploys com OIDC, `BLOB_STORE_ID` e a identidade do projeto substituem o token fixo. Com Blob, o navegador usa uma URL assinada e envia o arquivo diretamente à store, inclusive arquivos maiores que o limite das Functions.

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | PostgreSQL com extensão PostGIS. |
| `BLOB_READ_WRITE_TOKEN` | Credencial alternativa para Blob, útil em localhost ou stores antigas. Não é necessária com store OIDC conectada. |
| `BLOB_STORE_ID` | Identificador da store Blob usado com OIDC; a integração Vercel o fornece ao projeto. |
| `OPENAI_API_KEY` | Interpretação de comandos e geração de imagem, somente no servidor. |
| `OPENAI_TEXT_MODEL` | Modelo de texto; padrão `gpt-4.1-mini`. |
| `OPENAI_IMAGE_MODEL` | Modelo de imagem; padrão `gpt-image-1`. |
| `OPENAI_IMAGE_QUALITY` | `low`, `medium` ou `high`; padrão `medium`. |

O parser [`@mlightcad/libredwg-web`](https://github.com/mlightcad/libredwg-web) roda na função Node.js do Next e lê o DWG do armazenamento configurado; não envia o desenho a um serviço de conversão. O DWG original continua armazenado para reprocessamento. A dependência usa **GPL-3.0**: avalie as obrigações dessa licença antes de distribuir uma versão proprietária. O módulo WebAssembly inicia com reserva de memória alta e pode falhar em DWGs complexos; nesse caso, a importação informa o erro e mantém o original. Para reprocessar, abra o projeto e informe a medida de referência ou importe novamente.

## Testes

```bash
npm test
npm run build
```

Com o servidor Next.js local e o PostGIS em execução, rode o teste HTTP completo:

```bash
DATABASE_URL=postgresql://forma:forma@localhost:5433/forma TEST_BASE_URL=http://127.0.0.1:3000 npm test
```

O teste HTTP cria um projeto temporário, envia um DWG binário pelo armazenamento local, converte, persiste e recupera coordenadas. Também edita parede/piso/móvel, salva, recarrega, restaura revisão e verifica PostGIS, além de testar a demo. `tests/dwg.test.ts` lê o mesmo DWG real do projeto GNU LibreDWG; a atribuição está em `tests/fixture-sample-2000.LICENSE.md`. Upload Blob e chamadas OpenAI reais dependem de credenciais.

## Vercel

1. Importe este repositório como projeto Next.js, com diretório raiz na raiz do repositório.
2. Crie um PostgreSQL gerenciado com PostGIS (por exemplo Neon ou Supabase) e uma Blob store privada na Vercel.
3. Configure as variáveis acima nos ambientes necessários. Nenhuma chave de conversão DWG é necessária.
4. Execute `npm run db:migrate` apontando para o banco de produção antes de receber usuários. `npm run build` deve passar no pipeline.

Não há projeto Vercel vinculado neste repositório nem credenciais de deploy disponíveis no workspace. A publicação ainda não foi verificada.

## Limitações conhecidas

- O parser DXF preserva entidades não interpretadas. A interpretação arquitetônica cobre pares de linhas de parede, polilinhas fechadas de ambientes e aberturas com evidência explícita em layers/anotações. `h`, `PD`, `PDL`, `PDV` e `PDF` são preservados; associações ambíguas não são aplicadas. Plantas CAD variadas ainda precisam de validação antes de confiar em quantitativos de paredes.
- O LibreDWG/WASM passou em um DWG binário de teste, mas outro arquivo do conjunto GNU LibreDWG provocou erro interno do parser. Arquivos não suportados falham de forma explícita e conservam o original. O DWG de teste não é uma planta arquitetônica; ainda falta testar uma planta real com paredes, portas e cômodos.
- A navegação Three.js foi portada do projeto antigo e as vistas CAD/3D foram abertas no Chrome com uma planta de teste. Ainda faltam testes de navegação e colisão com plantas variadas. Sem escala confirmada, a vista 3D fica bloqueada.
- A biblioteca inicial contém dois GLB reais; licenças e atribuições estão em `public/assets/LICENSES.md`. Não há preços de fornecedor cadastrados.
- O acesso usa sessão privada por cookie, sem conta/login. Perder o cookie impede abrir o projeto. Para um SaaS multiusuário, é necessário adicionar autenticação e recuperação de conta.
- O render da OpenAI é uma visualização conceitual; composição e geometria podem variar. A geração é iniciada apenas por ação do usuário e tem limite por hora.
