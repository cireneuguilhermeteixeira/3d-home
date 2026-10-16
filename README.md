# Forma Studio

Aplicação Next.js para importar plantas CAD, revisar ambientes, explorar uma maquete Three.js e editar um projeto arquitetônico versionado. A interface segue a linguagem visual do protótipo em `design-reference/forma_studio_v2`.

## Estado atual

O fluxo local de criação, normalização **DXF**, edição, salvamento, restauração e exportação CSV foi implementado e testado. A transferência DXF pelo Blob ainda precisa de teste com credencial externa. A integração **DWG real** usa CloudConvert para converter DWG em DXF antes da normalização; não há parser DWG disfarçado. Essa integração, a interpretação OpenAI e a geração de imagem precisam das credenciais listadas abaixo e ainda não foram verificadas com contas externas. Consulte [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) para o estado preciso de cada requisito.

O modelo arquitetônico preserva as entidades CAD originais em `sourceCad.rawEntities`, mantém paredes/ambientes/aberturas interpretados em campos próprios e móveis/materiais em dados de design. As geometrias usam metros quando a unidade do DXF é conhecida. Se `$INSUNITS` não for confiável, a interface pede uma medida de referência antes de construir a maquete.

## Executar localmente

Requer Node.js 20.9+ e Docker para o PostGIS local.

```bash
npm install
docker compose up -d
cp .env.example .env.local
# Preencha DATABASE_URL e as credenciais desejadas em .env.local
npm run db:migrate
npm run dev
```

`DATABASE_URL=postgresql://forma:forma@localhost:5433/forma` corresponde ao `compose.yaml`. Abra `http://localhost:3000`. Sem `BLOB_READ_WRITE_TOKEN`, a criação de projetos funciona, mas o upload CAD não. Para testar o upload direto em localhost, a [documentação do Vercel Blob](https://vercel.com/docs/vercel-blob/client-upload) informa que o callback de conclusão precisa de uma URL pública; o fluxo de importação usa também a resposta do cliente, de modo que não depende desse callback local.

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | PostgreSQL com extensão PostGIS. |
| `BLOB_READ_WRITE_TOKEN` | Blob privado para arquivos CAD e renders. Crie uma store **private** na Vercel. |
| `CLOUDCONVERT_API_KEY` | Conversão DWG→DXF. |
| `CLOUDCONVERT_SOURCE_SECRET` | Chave aleatória longa para URLs temporárias usadas pela CloudConvert. |
| `APP_URL` | URL HTTPS pública do deploy para a CloudConvert baixar o DWG privado pela rota assinada. |
| `OPENAI_API_KEY` | Interpretação de comandos e geração de imagem, somente no servidor. |
| `OPENAI_TEXT_MODEL` | Modelo de texto; padrão `gpt-4.1-mini`. |
| `OPENAI_IMAGE_MODEL` | Modelo de imagem; padrão `gpt-image-1`. |
| `OPENAI_IMAGE_QUALITY` | `low`, `medium` ou `high`; padrão `medium`. |

O [CloudConvert Jobs API](https://cloudconvert.com/docs/api-reference/jobs) recebe uma URL assinada do DWG privado e retorna um DXF. A avaliação da [Autodesk Automation API](https://aps.autodesk.com/automation-apis) mostrou que o caminho nativo exigiria atividade e AppBundle AutoCAD próprios. A conversão DWG→DXF da CloudConvert é a dependência externa mais simples para este MVP. A importação aceita o arquivo original `.dwg` e conserva o formato de origem no JSON.

## Testes

```bash
npm test
npm run build
```

Com o servidor Next.js local e o PostGIS em execução, rode o teste HTTP completo:

```bash
DATABASE_URL=postgresql://forma:forma@localhost:5433/forma TEST_BASE_URL=http://127.0.0.1:3000 npm test
```

O teste HTTP cria um projeto temporário, edita parede/piso/móvel, salva, recarrega, restaura uma revisão e verifica projeções PostGIS. Testes pagos de CloudConvert e OpenAI não são simulados silenciosamente; dependem de credenciais e arquivos reais.

## Vercel

1. Importe este repositório como projeto Next.js, com diretório raiz na raiz do repositório.
2. Crie um PostgreSQL gerenciado com PostGIS (por exemplo Neon ou Supabase) e uma Blob store privada na Vercel.
3. Configure as variáveis acima nos ambientes necessários. Defina `APP_URL` com a URL HTTPS pública da aplicação e gere um segredo forte para `CLOUDCONVERT_SOURCE_SECRET`.
4. Execute `npm run db:migrate` apontando para o banco de produção antes de receber usuários. `npm run build` deve passar no pipeline.

Não há projeto Vercel vinculado neste repositório nem credenciais de deploy disponíveis no workspace. A publicação ainda não foi verificada.

## Limitações conhecidas

- O parser DXF preserva entidades não interpretadas. A interpretação arquitetônica cobre pares de linhas de parede, polilinhas fechadas de ambientes e aberturas com evidência explícita em layers/anotações. `h`, `PD`, `PDL`, `PDV` e `PDF` são preservados; associações ambíguas não são aplicadas. Plantas CAD variadas ainda precisam de validação antes de confiar em quantitativos de paredes.
- A navegação Three.js foi portada do projeto antigo e as vistas CAD/3D foram abertas no Chrome com uma planta de teste. Ainda faltam testes de navegação e colisão com plantas variadas. Sem escala confirmada, a vista 3D fica bloqueada.
- A biblioteca inicial contém dois GLB reais; licenças e atribuições estão em `public/assets/LICENSES.md`. Não há preços de fornecedor cadastrados.
- O acesso usa sessão privada por cookie, sem conta/login. Perder o cookie impede abrir o projeto. Para um SaaS multiusuário, é necessário adicionar autenticação e recuperação de conta.
- O render da OpenAI é uma visualização conceitual; composição e geometria podem variar. A geração é iniciada apenas por ação do usuário e tem limite por hora.
