# Mini aba do /estudar

Aba flutuante que mostra **uma tarefa por vez** do planejamento do `/estudar`, com botão
"Marcar como concluído", avanço automático para a próxima tarefa e "Tarefa 2 de 5 · faltam 3".
Fica no canto superior direito e pode ser arrastada pela barra de cima para qualquer ponto da
tela; a posição, as tarefas concluídas e o estado minimizado ficam salvos no navegador.

- `tarefas.py`: transforma a fila do `fila.py` (da skill) na lista de tarefas, uma por leitura ou
  lista de exercícios, na ordem do plano. Com `--js mini-aba.js` gera o trecho que o `/estudar`
  roda na aba do livro.
- `mini-aba.js`: a aba. Expõe `window.__miniAba` (`carregar`, `concluir`, `desfazer`, `estado`,
  `abrir`, `fechar`, `minimizar`). Alt+Shift+E reabre depois de fechar.
- `exemplo/`: página de demonstração com o planejamento do exemplo (ler pp. 5–14, Revisando 4,
  Propostos 23…). Para ver: `python3 -m http.server` nesta pasta e abra
  `http://localhost:8000/exemplo/demo.html`.

Regerar o exemplo: `python3 -I tarefas.py exemplo/fila-exemplo.json --livro "PV Matemática – L3" > exemplo/payload.json`
