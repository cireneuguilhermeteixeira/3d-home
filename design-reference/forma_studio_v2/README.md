# Forma Studio · Protótipo v2

Experiência de onboarding e editor de interiores em **HTML + CSS + JavaScript puro**, sem framework nem backend.

## Como abrir

Descompacte o ZIP e abra `index.html` no navegador. Os arquivos `styles.css`, `app.js` e a pasta `assets` devem permanecer junto ao HTML. Para desenvolvimento, um servidor estático local também funciona.

## Fluxo

1. Tela inicial com composição arquitetônica CSS animada por scroll e movimento do mouse. Nenhuma fotografia na hero.
2. Escolha de estilos, em uma tela independente.
3. Preferências de plantas, atmosfera e observações, em outra tela independente.
4. Escolha da fonte: DWG ou RoomPlan (futuro); seleção de arquivo simulada.
5. Carregamento breve simulado e CAD ilustrativo com oito cômodos para nomear.
6. Primeira pessoa fica bloqueada até nomear os oito cômodos. “Aplicar sugestões” preenche automaticamente; “Personalizar manualmente” abre uma cena vazia.
7. Editor demonstrativo com biblioteca de móveis, seleção de pontos de interesse, materiais, hora do dia, campo de instrução em linguagem natural e modal de render fotorrealista.
8. Orçamento ilustrativo e download **CSV demonstrativo**, sem dados reais de lojas, cotação ou metragem.

## Importante

- A planta CAD é uma **ilustração de interface**, não é a planta real da Casa 628 nem uma conversão do arquivo DWG.
- O editor usa uma **imagem de referência** do protótipo anterior; não há render Three.js funcional neste pacote.
- As opções de IA, movimentação de móveis e alterações de pintura/piso são protótipos de interface, não edições reais de malhas.
- O upload DWG, RoomPlan, processamento, geração fotorrealista e consulta real de preços serão integrações futuras.
- O JavaScript (`app.js`) serve apenas para navegação, respostas visuais, seleção de ambientes e geração local do CSV. Não depende de serviços externos.

## Arquivos

- `index.html`: estrutura das telas.
- `styles.css`: identidade, layout, animação arquitetônica, mobile.
- `app.js`: fluxo interativo e lógica de demonstração.
- `assets/interior-reference.jpg`: imagem de referência na vista em primeira pessoa.
- `assets/photo-reference.jpg`: imagem de exemplo no modal fotorrealista.
