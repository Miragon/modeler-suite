# Many models on a board

A part of the board's guide. [`CLAUDE.md`](../CLAUDE.md) keeps what every change needs and names
[every part's document](../CLAUDE.md#the-parts-and-their-documents). What is found out about a
board with many model nodes is written here: how its numbers are taken, the numbers, and where
the time and the memory go.

**State.** The plan's increment 7 measures first and builds what the numbers ask for. This
document holds the numbers **before**: the tree at `c6830132` with nothing of the product
changed, taken on 2026-11-16. The bench and its generator are the only code that came with them
([`e2e.md`](e2e.md#the-bench-e2ebench)). An independent check then read the bench, corrected
what it took for T1 and for a pan
([what the first bench took](#what-the-first-bench-took-for-these-and-why-it-was-changed)), took
the tables anew, tried to refute where the time goes, and decided what the numbers ask for
([What the numbers ask for](#what-the-numbers-ask-for)). **None of it is built**: the work was
stopped after the measuring, since nothing here stands between the board and its pull request.
A change that is built for many models later is kept only if the same bench shows its gain
outside the range of the runs, and its numbers go into this document beside these.

## In short

- **60 models are fine as they are.** In sandboxed Chromium the last preview is drawn 1.46 s
  after the open (web app and webview, cold, median of five runs), a pan is answered within
  100 ms from 0.76 to 0.85 s on, in the webview bundle every pan of the load, the heap is 22 MB,
  and at rest a pan takes 20 to 25 ms. In a real VS Code 1.146.0 the last preview is drawn
  2.0 s after the board's tab was opened.
- **200 models open, and do not answer in time once their modelers come.** The last preview is
  drawn after 3.4 s in the web app, 4.6 s in the webview bundle and 5.7 s in VS Code. A pan of
  the load takes 131 to 235 ms, and at rest a pan takes 103 to 107 ms in headless Chromium,
  over the 100 ms of T1, and 77 ms in VS Code. The first fit stands at the board's smallest
  zoom and cuts the board at the window's edges.
- **The load is the modelers' own work**, one after the other. With a modeler that draws one
  rectangle in the place of each, the last preview of 60 models is there 158 ms after the
  board has drawn, where it takes 990 ms; of 200 models after 203 ms where it takes 4.2 s.
- **At rest nothing of it is script.** A pan and a zoom are the browser's own work, and two
  thirds of it are the previews' content: with the previews not rendered a pan at 200 models
  takes 43.6 ms where it takes 133.8 ms.
- **In VS Code a board holds at most 50 documents.** VS Code lets go of the oldest as the 51st
  is opened, and of all of them three minutes later. Every extension is told of each.
- **What the numbers ask for, none of it built**: on a board that is zoomed out below 12 % the previews are not rendered and
  each node says its file's name, which is what the board of 200 models asks for and what
  the board of 60 never meets at its fit; the fit of a board whose nodes lie further apart than
  the smallest zoom shows a node; and the model list's titles are made in one pass. Nothing
  else: no number asks for it ([What the numbers ask for](#what-the-numbers-ask-for)).

## How the numbers are taken

### The boards

`e2e/bench/generate.ts` makes them from the seven models of `example/`, each model node on a
copy of its model under a path of its own (`models/<notation>/<name>-<nnn><suffix>`), the seven
notations in equal shares, on a grid at the example's node size (800 x 540, 880 x 640 apart),
`ceil(sqrt(1.2 n))` columns wide. Above the grid stands the example's group with two notes and
the picture; beside it one note per thirty models; from every tenth model an arrow to its
neighbour. Nothing is random: the same call gives the same bytes.

| Board                   | Model nodes    | Nodes | Arrows | Files  |
| ----------------------- | -------------- | ----- | ------ | ------ |
| `models-7`              | 7              | 11    | 1      | 9      |
| `models-60`             | 60             | 66    | 6      | 62     |
| `models-200`            | 200            | 210   | 20     | 202    |
| `<notation>-10`         | 10 of one kind | 14    | 1      | 12     |
| `repository-2000-20000` | 7 of 2,000     | 7     | 0      | 22,002 |

The last one is the repository's side: 2,000 model files three folders deep among 20,000 other
files, and a board on the first seven. `node modelers/board/e2e/bench/generate.ts <folder>`
writes the ten boards as folders, with `large` behind it also the repository. Nothing generated
is committed.

### The bench

`npm run board bench` (how it is built is in [`e2e.md`](e2e.md#the-bench-e2ebench)) loads a
board in Chromium with its sandbox on, in a window of 1280 x 800, in two places:

- **`webapp`**: the web app's production build, with the generated repository in the place of
  the example folder, opened with `?reset`.
- **`webview`**: the extension's production webview bundle, one script and one sheet, behind
  the document and the content security policy the extension writes, with a stand-in for the
  extension in the page. What a real extension host adds is not in it.

A **cold** run is the first load of the board in a browser context of its own: nothing is
cached. A **warm** run is the third load in the same context: Chromium writes a script's code
cache after its second load. Each of the two is followed by a load of the same temperature that
is panned throughout: the cold one in a context of its own, the warm one as the fourth load of
its context. Each load is a page of its own. The browser itself is started once per place, so a
cold run is a cold page in a browser that runs. A number is the **median** of the runs with
their **range**, to a tenth as measured.

    BOARD_BENCH_BOARDS=models-60 BOARD_BENCH_RUNS=7 npm run board bench

The results are JSON files, one per place and board with every run in it, and `summary.md` and
`summary.json` with the medians, under `e2e/test-results/bench/results` or where
`BOARD_BENCH_OUT` says.

### What each number is

Every input is real input through the browser, and every time is read inside the page, in ms
since the navigation started. A board is loaded twice per run and temperature: once left alone,
and once panned throughout. A pan is a frame the page has to produce, so a load that is panned
is another load than one that is left alone: on the board of 60 models its last preview comes
about four tenths later.

- **T2, the time until every preview is drawn**, of the load nobody touches. Every model node's
  editor says `ready` (`data-embed-state`), its diagram has drawn an element
  (`.djs-container > svg .djs-element`), and the frame after the last of them was produced. The
  bench looks every 10 ms.
- **T1, the time to the first interaction**, of the panned load. From the moment the board has
  drawn (every node's frame and the toolbar are in the DOM) the bench pans the bare pane as a
  hand does: a press, 60 ms later a move of 2 px, and once the page drew that the release, one
  way and then the other. The next pan follows once the last one was answered and as long again
  has passed, and at least 50 ms: the pans leave the load at least half of the page's time. T1
  is when the first pan that was answered within 100 ms was answered. Where no pan is answered
  within 100 ms up to a second after the last preview, T1 is **not reached**, and the table
  says in how many runs it was.
- **The pans of the load** stand beside T1: how many the page took between the board's drawing
  and its last preview, how many of them were answered within 100 ms, their median and the
  slowest, and **the last slow pan**, which is when the last pan that took longer than 100 ms
  was answered. **T2 under pans** is the last preview of the panned load. A panned load that
  takes longer than six times the quiet T2, and at least 30 s, is read as it stands, without a
  T2 of its own.
- **A pan is answered when the frame that shows it has been produced.** The probe sees that
  with a task of the highest priority that it queues in the frame's own callback
  (`scheduler.postTask`, `user-blocking`): it runs once the frame's work on the main thread is
  done and before every task the page queued earlier.
- **A pan at rest** is the same pan, 6 px wide, eight times in the second after T2 of the quiet
  load: its median.
- **M, the memory at rest.** Two seconds after T2 of the quiet load and after two forced
  collections (`HeapProfiler.collectGarbage`): the JS heap in use (`Runtime.getHeapUsage`), the
  DOM nodes of the page's process, attached or not (`Performance.getMetrics`, `Nodes`), and the
  resident memory of the renderer process (`/proc/<pid>/status`, where there is one). In the
  webview place the stand-in for the extension holds the repository's texts in the page: 0.17 MB
  at 60 models and 0.56 MB at 200, which are in the heap.
- **The scripted two seconds.** With all previews drawn: one second of dragging the pane along
  a path, half a second of wheeling in, and the same wheel steps out, one input every 16 ms
  where the page keeps up. Frames per second are the frames the compositor drew (`DrawFrame`
  in a trace of the script) by the script's length; the longest task is the main thread's
  (`RunTask`). The trace is on while the script runs.
- **Arming and leaving.** A real double-click on the preview of the Wardley node nearest the
  middle of the window (of a board of one notation: of that notation), until the Done control
  names the node and the board's move has ended; then a click on Done, until the editor is a
  preview again. The arming moves the board to 100 % over the design system's motion time, so
  its time is that move.
- **Beside them**: when the board had drawn, the longest task and the time the long tasks took
  beyond 50 ms each (`longtask`), the browser's own sums of script, layout and style
  (`Performance.getMetrics`), the count of mounted modelers, and two **yardsticks**: a fixed
  loop in the bench's own process, alone and on six threads at once, timed right before the
  quiet load.
- **A run that is no run fails**: a node that failed, a preview without a picture, a preview
  that never comes, an error of the page, a panned load in which no pan moved the board.

### What the first bench took for these, and why it was changed

The numbers of this document were first taken with a bench that an independent check then
corrected, on the same day. Three things were wrong, and each made a number say something else
than its name:

- **A pan's answer was read behind the load's own tasks.** The first probe queued a message
  task in the frame after a pan and took the answer's time there. A message task waits behind
  every task the page queued earlier, and while a board loads that is every text still to be
  mounted. On the board of 60 models a pan of the load was answered after 37.8 ms (32.2 to
  53.6, the median of a load's pans, five runs) by the frame's own task and after 1,107.8 ms
  (984.2 to 1,614.8) by the message task, in the same loads. So the first tables' "last slow
  pan" and "slowest pan" of a load, and every T1 that came out at T2, were the end of the
  load's queue and no answer.
- **The bench panned only when the page had answered a question of the bench**
  (`page.evaluate`), and a page answers such a question behind its queued tasks as well. A load
  got no pan to three pans, so T1 stood on whether one of them fell into the gap before the
  first text arrived: 0.7 s in a run where it did, T2 in a run where it did not.
- **The pan was sent as four events at once**, the press, the move and the release in one
  frame. On the board of 200 models at rest such a pan took 138.4 ms (128.3 to 150.3) where a move after a press took 85.8 ms (81.6 to 97.5) and a move of a held drag 89.9 ms (83.4 to 95.5), five runs in one sitting. The walk in a real VS Code sent its
  events one after the other, so its 77 ms and the bench's 130 ms at 200 models were two
  different pans.

What was not wrong: T2, the memory, the frames, the arming, and everything of the host's and
the repository's side. The tables below are a second sitting with the bench as it stands; what
of the first sitting came again and what did not is said under them.

### A real VS Code

The same boards are opened in a real VS Code inside the suite's Docker runner
([`vscode.md`](vscode.md#a-real-vs-code-in-the-docker-runner)) by a scratch walk that is not in
the tree. It starts VS Code with the smoke driver's arguments on a fresh profile, the generated
repository as its folder and no file open, opens the board by `vscode.openWith`, and puts the
bench's own probe into the board's webview. So T2 means what it means above, counted **from
the command that opens the board's tab**. The walk pans with its own loop, one event after the
other through the window's mouse and only once the page has answered a question, and it was
run with the first bench's probe: its T1 is struck (below). The extension is the VSIX the tree packs,
unpacked and unchanged (the walk's own folder is in its file list, and nothing loads it), and
is activated by the board's own open. A second extension beside it, activated at startup,
writes down what VS Code tells any extension of text documents and reads the extension host's
own memory.

- **cold**: the first open of the board in a VS Code that was just started on a new profile.
  **warm**: the board's tab closed and opened again in the same window.
- VS Code loads a webview into a frame it hides until the content has loaded. The probe is put
  in while the frame is still hidden, about 0.3 s after the command in the median. A person
  sees the board when VS Code shows the frame, and no pan reaches it before.
- **The webview's memory**: a DevTools session on the webview's own frame, which is a process
  of its own: two forced collections, then the JS heap in use and the DOM nodes, as in the
  bench; and from `/proc` the resident memory of the renderer process that came with the board.
- **The extension host's memory**: `process.memoryUsage()` inside it after a forced collection.
- The container has no graphics card and draws in software, on a virtual screen.

### The machine

A virtual machine with 12 processors that shares its host with others. While the numbers were
taken its neighbours took between nothing and most of its time, and a load that takes 1.4 s in
a quiet minute took 1.9 s in an ordinary one and 4.6 s in a busy one. So every number here is a
comparison on this machine, never a promise, and a before and an after are taken in turns in
one sitting. Two yardsticks stand beside every load. The loop alone takes about 145 ms and
hardly moves: in the busiest minute it took 150 ms while six of it at once took five to eight
times as long as one, and the board of 200 models then loaded in 17.6 s. A browser that draws
in software works on several threads, so the yardstick on six threads is the one that says
which sitting a number is of: about 430 to 550 ms in the sitting of the tables below.

## The numbers before

### Sandboxed Chromium

Chromium 158.0.8127.18 (Playwright's headless shell), sandbox on, on the machine above, with
the bench as it stands. Each cell is the median with the range of five runs, all in one sitting
of 17 minutes in which the yardstick on six threads read 416.9 to 633.7 ms.

**The plan's three numbers:**

| Place   | Models | Run  | Runs | T1 ms                     | T2 ms                     | Heap MB             | DOM nodes              | Renderer MB            |
| ------- | ------ | ---- | ---- | ------------------------- | ------------------------- | ------------------- | ---------------------- | ---------------------- |
| webapp  | 7      | cold | 5    | 577.9 (566.1 to 682.8)    | 746.1 (711.5 to 811.6)    | 12.1 (12.1 to 12.1) | 2288 (2288 to 2288)    | 187.5 (186.8 to 188.2) |
| webapp  | 7      | warm | 5    | 594.6 (556.1 to 663.8)    | 726.8 (713.7 to 770.2)    | 12.1 (12.1 to 12.1) | 2288 (2288 to 2288)    | 188.2 (187.3 to 192.6) |
| webapp  | 60     | cold | 5    | 757.4 (742 to 1407.7)     | 1468.5 (1381.8 to 1514.2) | 21.9 (21.9 to 21.9) | 16516 (16516 to 16516) | 263.2 (262 to 264.2)   |
| webapp  | 60     | warm | 5    | 1130.8 (713.7 to 1202.5)  | 1406.7 (1365.3 to 1620.3) | 21.9 (21.9 to 21.9) | 16516 (16516 to 16516) | 262.8 (262.8 to 263.2) |
| webapp  | 200    | cold | 5    | 885.9 (879.2 to 3766.3)   | 3369.7 (3223.7 to 3863.7) | 41.9 (41.9 to 42)   | 54064 (54064 to 54064) | 505.8 (502.3 to 507.1) |
| webapp  | 200    | warm | 5    | 3584.2 (867 to 3797.6)    | 3304.6 (3217.5 to 3401.1) | 41.9 (41.9 to 42.1) | 54064 (54064 to 54064) | 506.2 (505.7 to 507.8) |
| webview | 7      | cold | 5    | 607.9 (583.3 to 775)      | 712.6 (699.5 to 778.1)    | 12.6 (12.6 to 12.6) | 2177 (2177 to 2177)    | 187.7 (187.2 to 188)   |
| webview | 7      | warm | 5    | 725.5 (578.3 to 748.7)    | 695.9 (685.8 to 713.8)    | 12.6 (12.6 to 12.6) | 2177 (2177 to 2177)    | 187.4 (187.1 to 187.7) |
| webview | 60     | cold | 5    | 851.4 (754.1 to 871.9)    | 1458.4 (1407.7 to 1488.1) | 22.2 (22.2 to 22.3) | 16405 (16405 to 16405) | 262.5 (262 to 263.2)   |
| webview | 60     | warm | 5    | 849.9 (710.5 to 896.7)    | 1432.1 (1410.9 to 1597)   | 22.3 (22.2 to 22.3) | 16405 (16405 to 16405) | 262.4 (261.9 to 263.9) |
| webview | 200    | cold | 5    | 1123.2 (1073.7 to 1187.3) | 4590.4 (4359.6 to 4932.3) | 43 (42.9 to 43.1)   | 53953 (53953 to 53953) | 451.1 (447.5 to 452.5) |
| webview | 200    | warm | 5    | 1163.8 (1057.9 to 1548)   | 4538.3 (4338.5 to 5984.9) | 43 (42.9 to 43)     | 53953 (53953 to 53953) | 451.9 (445.3 to 452.4) |

**The pans of the panned load:**

| Place   | Models | Run  | Runs | Board drawn ms         | Pans of the load | Of them in time | Median pan ms          | Slowest pan ms         | Last slow pan ms          | T2 under pans ms          |
| ------- | ------ | ---- | ---- | ---------------------- | ---------------- | --------------- | ---------------------- | ---------------------- | ------------------------- | ------------------------- |
| webapp  | 7      | cold | 5    | 502.2 (485.1 to 552.8) | 2 (1 to 2)       | 2 (1 to 2)      | 25.4 (12.8 to 53.9)    | 28.7 (21.3 to 60.2)    | 577.9 (566.1 to 682.8)    | 769.5 (756.8 to 1027.3)   |
| webapp  | 7      | warm | 5    | 487.8 (478.9 to 493.1) | 2 (2 to 2)       | 2 (2 to 2)      | 16.5 (5.3 to 21.2)     | 22.9 (5.7 to 25.3)     | 594.6 (556.1 to 663.8)    | 780.6 (779.5 to 953.5)    |
| webapp  | 60     | cold | 5    | 593.3 (551.2 to 688.7) | 2 (2 to 3)       | 2 (1 to 2)      | 73.4 (55.3 to 117.9)   | 140.3 (86.2 to 152.6)  | 1237.7 (749.2 to 1821.1)  | 1570.8 (1503.4 to 1849.9) |
| webapp  | 60     | warm | 5    | 591.4 (552.4 to 637.9) | 2 (2 to 3)       | 1 (1 to 2)      | 81.2 (61.9 to 114.9)   | 117.4 (94.5 to 124.7)  | 1202.5 (737.7 to 1611.8)  | 1479.3 (1474.8 to 1633.8) |
| webapp  | 200    | cold | 5    | 753.7 (720.1 to 766.8) | 3 (3 to 4)       | 1 (1 to 2)      | 234.5 (157.8 to 245.7) | 336.2 (269.1 to 607.4) | 3065.8 (2380.2 to 3766.3) | 3628.8 (3419 to 3766.2)   |
| webapp  | 200    | warm | 5    | 721.9 (714.2 to 739.9) | 3 (3 to 4)       | 1 (1 to 1)      | 237.2 (160.4 to 259.6) | 307.7 (295.9 to 513.2) | 3584.2 (3121.4 to 3797.6) | 3588.9 (3571.3 to 3797.6) |
| webview | 7      | cold | 5    | 444.7 (408.5 to 514)   | 1 (0 to 1)       | 1 (0 to 1)      | 8.8 (0 to 24)          | 8.8 (0 to 24)          | 607.9 (583.3 to 775)      | 755.9 (741.5 to 758.8)    |
| webview | 7      | warm | 5    | 484.9 (399.8 to 500.8) | 1 (0 to 1)       | 1 (0 to 1)      | 16.3 (0 to 27.9)       | 16.3 (0 to 27.9)       | 725.5 (578.3 to 748.7)    | 731.2 (715.4 to 765.8)    |
| webview | 60     | cold | 5    | 573.1 (560.2 to 594.5) | 8 (7 to 8)       | 8 (7 to 8)      | 22.5 (18.4 to 27.6)    | 53.3 (28.6 to 62.3)    | 851.4 (754.1 to 871.9)    | 2028.4 (2011.6 to 2079.9) |
| webview | 60     | warm | 5    | 493.8 (415.9 to 558.6) | 8 (7 to 8)       | 8 (7 to 8)      | 27.5 (22.1 to 30.8)    | 43.8 (33.5 to 63.3)    | 849.9 (710.5 to 896.7)    | 2029.5 (1999.9 to 2154.8) |
| webview | 200    | cold | 5    | 727 (698 to 804.3)     | 12 (12 to 14)    | 2 (2 to 4)      | 131.4 (116.1 to 132.4) | 209 (196.5 to 215.7)   | 5664.3 (5595.7 to 5832)   | 5841.1 (5575.2 to 6221.7) |
| webview | 200    | warm | 5    | 742 (698.8 to 822.2)   | 13 (12 to 14)    | 2 (1 to 5)      | 131.1 (115.2 to 138.4) | 209.2 (186.7 to 251.2) | 5856.7 (5377.4 to 6074.2) | 5980.2 (5673.6 to 6380.7) |

**The quiet load beside them:**

| Place   | Models | Run  | Runs | Longest task ms  | Blocked ms          | Script ms              | Layout ms              | Style ms                | Yardstick ms           | On six threads ms      |
| ------- | ------ | ---- | ---- | ---------------- | ------------------- | ---------------------- | ---------------------- | ----------------------- | ---------------------- | ---------------------- |
| webapp  | 7      | cold | 5    | 56 (0 to 70)     | 6 (0 to 22)         | 158.7 (155.7 to 176.4) | 40.6 (35.7 to 47.6)    | 56.9 (54.5 to 57.6)     | 142.8 (140.3 to 145.3) | 454.9 (416.9 to 580.4) |
| webapp  | 7      | warm | 5    | 53 (0 to 55)     | 3 (0 to 5)          | 154.2 (152.7 to 161.2) | 37.9 (34.7 to 43.9)    | 54.7 (53.9 to 57.8)     | 147.1 (143.9 to 157.5) | 453.1 (420.9 to 526.2) |
| webapp  | 60     | cold | 5    | 146 (141 to 150) | 422 (386 to 455)    | 243.4 (209.4 to 291.7) | 128.6 (119.8 to 144.1) | 261.1 (248.9 to 291.4)  | 150.6 (143.7 to 179.9) | 578.5 (475.4 to 633.7) |
| webapp  | 60     | warm | 5    | 143 (131 to 168) | 401 (362 to 545)    | 244 (219.4 to 277)     | 133.1 (119.5 to 149.5) | 253.1 (242.1 to 310.3)  | 144.4 (138.3 to 180.5) | 534.6 (445.9 to 592.7) |
| webapp  | 200    | cold | 5    | 438 (425 to 486) | 2004 (1860 to 2433) | 380.8 (359.9 to 392.4) | 453 (427.7 to 550.2)   | 789.9 (756.8 to 871.5)  | 149.3 (141.6 to 151)   | 506.5 (426.6 to 520)   |
| webapp  | 200    | warm | 5    | 449 (427 to 491) | 1950 (1856 to 2050) | 350.2 (345.2 to 379.1) | 461.6 (435.8 to 468.4) | 775.9 (765.9 to 812.3)  | 144.4 (140.6 to 147.1) | 515.1 (452.3 to 546.4) |
| webview | 7      | cold | 5    | 241 (228 to 263) | 225 (208 to 239)    | 320.6 (304.5 to 337.9) | 35.8 (34 to 53)        | 53.8 (50.6 to 59.3)     | 144.2 (139.6 to 147.4) | 482.3 (448.3 to 533.9) |
| webview | 7      | warm | 5    | 234 (231 to 245) | 213 (209 to 220)    | 315 (305.9 to 319)     | 37.6 (36.4 to 38.5)    | 52.5 (51.7 to 55.5)     | 142.4 (138.6 to 153.8) | 476 (450.6 to 542.3)   |
| webview | 60     | cold | 5    | 238 (230 to 255) | 260 (255 to 281)    | 365.3 (357.5 to 380.5) | 123.8 (118.3 to 128.9) | 249.8 (244.3 to 259)    | 142.6 (139.8 to 153.7) | 488.8 (459.8 to 513.8) |
| webview | 60     | warm | 5    | 238 (224 to 283) | 261 (243 to 315)    | 368.7 (352.7 to 420.7) | 123.4 (119.5 to 133.9) | 252.3 (239.9 to 267.7)  | 144.5 (141 to 152.8)   | 448.1 (440.4 to 531.1) |
| webview | 200    | cold | 5    | 234 (224 to 290) | 600 (583 to 756)    | 454.2 (444 to 528.6)   | 469.3 (449.6 to 528.1) | 825.7 (795.5 to 858.6)  | 148.6 (144.7 to 160.4) | 462.8 (456.4 to 547.4) |
| webview | 200    | warm | 5    | 246 (230 to 268) | 646 (565 to 792)    | 492.4 (450.8 to 520.3) | 473.6 (459.3 to 623.1) | 818.1 (797.4 to 1025.1) | 143.5 (141.1 to 149.5) | 520.5 (450.7 to 538.1) |

**At rest:**

| Place   | Models | Run  | Runs | Pan at rest ms         | Frames per second   | Pan in the script ms | Longest task in the script ms | Arm ms                 | Leave ms            |
| ------- | ------ | ---- | ---- | ---------------------- | ------------------- | -------------------- | ----------------------------- | ---------------------- | ------------------- |
| webapp  | 7      | cold | 5    | 7.3 (5.2 to 8.3)       | 51.6 (49.5 to 53)   | 12.8 (12.2 to 13.1)  | 9.9 (8.1 to 19.1)             | 275 (272.8 to 279.3)   | 12.9 (12.4 to 17.2) |
| webapp  | 7      | warm | 5    | 8.7 (7.9 to 9)         | 52.8 (50.8 to 54.6) | 12.9 (12.3 to 13.2)  | 8.4 (7.5 to 9.8)              | 276.6 (274.5 to 281.5) | 13 (11.7 to 24.4)   |
| webapp  | 60     | cold | 5    | 24.5 (15.5 to 27.6)    | 30.3 (26.6 to 31.6) | 25.6 (21.7 to 26.7)  | 32.9 (32.3 to 37.8)           | 295.5 (286.5 to 298.5) | 19.2 (16.8 to 29.2) |
| webapp  | 60     | warm | 5    | 25.5 (24 to 32.5)      | 29.6 (24.8 to 33.2) | 26.1 (24.2 to 27.3)  | 29 (27.9 to 43.6)             | 290.2 (285.6 to 298.2) | 17.9 (17.4 to 20.3) |
| webapp  | 200    | cold | 5    | 103.1 (102.6 to 108.9) | 18.8 (17.5 to 20)   | 83.9 (82.3 to 87)    | 101.2 (91.2 to 105.6)         | 327.8 (308.2 to 345.2) | 28 (27.8 to 34.1)   |
| webapp  | 200    | warm | 5    | 101.3 (99.5 to 114.3)  | 17.4 (15.5 to 19.9) | 86.2 (80.8 to 93.7)  | 100.4 (87.4 to 108.1)         | 322.9 (311.1 to 356.3) | 29.6 (28 to 40.9)   |
| webview | 7      | cold | 5    | 7.5 (7.4 to 8)         | 51.6 (49.2 to 52.6) | 12.8 (10.7 to 13.4)  | 9.5 (7.4 to 16.8)             | 280.2 (276 to 286.6)   | 11.7 (11.7 to 15.3) |
| webview | 7      | warm | 5    | 8.9 (8 to 11.4)        | 52.8 (52 to 53.7)   | 13 (12.6 to 13.1)    | 7.8 (6.9 to 9)                | 278.4 (275 to 299.2)   | 12.5 (12.1 to 13.6) |
| webview | 60     | cold | 5    | 19.8 (14.2 to 28.3)    | 30.2 (29.8 to 31.1) | 24.6 (23.9 to 26.4)  | 28.3 (27.5 to 32.7)           | 292.1 (286.9 to 299.5) | 16.9 (16.5 to 20.2) |
| webview | 60     | warm | 5    | 25.6 (17.8 to 28.6)    | 29.6 (28.1 to 30.1) | 26 (24.2 to 27.5)    | 30.9 (26.8 to 34.5)           | 293.4 (284.1 to 299.3) | 17.9 (16.4 to 28.3) |
| webview | 200    | cold | 5    | 107 (103.4 to 118.8)   | 16.8 (15.8 to 23.5) | 84.3 (79.4 to 90.3)  | 100.3 (92.6 to 109)           | 317.9 (302.7 to 326.3) | 26.5 (25.5 to 27.6) |
| webview | 200    | warm | 5    | 111.6 (104.4 to 119.9) | 20.5 (15.8 to 22)   | 85.6 (77.3 to 85.9)  | 95.6 (94.2 to 126.5)          | 315.3 (304.5 to 324.5) | 28.6 (28 to 29.2)   |

- **60 models answer while they load.** In the webview bundle every pan of the load was
  answered within 100 ms (seven to eight pans a load, a median of 22.5 ms, the slowest 53.3 ms),
  so T1, 851.4 ms, is the moment from which a person can act. In the web app, whose repository
  in memory hands the page its texts in fewer and longer tasks (422 ms of long tasks beyond 50
  ms each against the webview's 260 ms, most of which is the bundle's own first task), a load
  took two or three pans, a median of 73.4 ms and the slowest 140.3 ms: not every pan is in
  time there.
- **200 models do not.** The first pans after the board's frames are drawn are in time, which
  is the T1 of the table (885.9 ms and 1,123.2 ms); once the modelers come no pan is: a median
  of 234.5 ms in the web app and 131.4 ms in the webview, with 2 of 12 in time. And **at rest a
  pan takes 103.1 ms (102.6 to 108.9) in the web app and 107 ms (103.4 to 118.8) in the
  webview: over the 100 ms of T1.** A move of a held drag in the scripted two seconds takes
  83.9 and 84.3 ms, and the script draws 16.8 to 18.8 frames a second.
- **The webview is slower than the web app at 200 models** (4,590.4 ms against 3,369.7 ms, the
  ranges apart) and not at 7 or 60. The stand-in for the extension hands the page every text in
  a task of its own, as VS Code does, and the page draws frames between them; the web app's
  repository in memory answers through a channel of the page's own. The long tasks beyond 50 ms
  say the same: 600 ms in the webview, 2,004 ms in the web app.
- **A load that is panned takes longer**: the last preview of 60 models comes after 2,028.4 ms
  in the webview where the quiet load has it after 1,458.4 ms, and that of 200 models after
  5,841.1 ms against 4,590.4 ms. The web app, which takes few pans, loses less (1,570.8 ms
  against 1,468.5 ms at 60).
- **Cold and warm do not differ outside the range** on any board.
- **Arming is the board's move**: 275 to 328 ms on every board, the design system's motion
  time and a frame or two. Leaving is 12 to 30 ms.

### The first sitting, and what of it came again

The first tables of this document were taken some hours earlier with the first bench, seven
runs on the boards of 7 and 60 models and seven on the board of 200. Against the sitting above:

- **Came again:** the JS heap and the DOM nodes on every board and in both places, to 0.2 MB
  and to 8 nodes (12.2, 22 and 42.1 MB in the web app then, 12.1, 21.9 and 41.9 MB now); the
  frames per second on the boards of 7 and 200 models; the arming and the leaving; that the
  webview is slower than the web app at 200 models and not below; that cold and warm do not
  differ.
- **Did not come again, because the first sitting was a slower one:** T2. Then 999.1 ms (817.6
  to 1,117.8), 1,864.1 ms (1,652 to 2,295.2) and 3,671.6 ms (3,447.3 to 4,480.3) in the web
  app and 984.5 ms, 1,919.5 ms and 4,922.7 ms (4,827.7 to 6,104) in the webview; now each
  median lies below the first range, by a fifth to a quarter at 7 and 60 models and by a
  twelfth to a fifteenth at 200. A run of the first bench between the two sittings gave 1,499.2
  ms (1,408.9 to 1,517.1) in the web app and 1,906.7 ms (1,551.7 to 2,132.4) in the webview at
  60 models, one place after the other in one run: the machine changes within minutes. With T2
  went the longest task (216 ms then, 146 ms now, in
  the web app at 60 models), the frames per second at 60 models (21.2 and 27.7 then, 30.3 and
  30.2 now) and the renderer's resident memory, which read 450.6 MB in the web app at 200
  models then and 505.8 MB now, for a reason that was not looked for.
- **Struck, because the first bench did not measure what they are called**: T1, the last slow
  pan and the slowest pan of a load (then: T1 at 60 models 717.3 ms cold and 1,764.6 ms warm
  in the web app, "the last slow pan" 1,702.6 ms in the webview, "reached in 2 of 7 runs" at
  200), and the pan at rest (then 44.8 and 32 ms at 60 models and 130 and 132.1 ms at 200, the
  four events at once; now a hand's pan, 24.5 and 19.8 ms and 103.1 and 107 ms).

**Ten nodes of one notation each** (cold, five runs, the first sitting; T1 was taken with the first
bench and is left out):

| Ten nodes of          | Place   | T2 ms                  | Heap MB             | DOM nodes           | Frames per second   | Arm ms                 | Leave ms            |
| --------------------- | ------- | ---------------------- | ------------------- | ------------------- | ------------------- | ---------------------- | ------------------- |
| Wardley Map           | webapp  | 726 (663.1 to 825.8)   | 9.1 (9.1 to 9.2)    | 3377 (3377 to 3385) | 53.5 (46.5 to 56.2) | 275.3 (271.3 to 286.5) | 11 (10.7 to 11.5)   |
| Wardley Map           | webview | 675.4 (658.8 to 681.7) | 10 (10 to 10)       | 3284 (3284 to 3284) | 56.3 (54.9 to 57.5) | 283.7 (272.6 to 287.6) | 13.9 (11 to 22.3)   |
| Event Storming        | webapp  | 643.1 (636.7 to 657.8) | 8.6 (8.6 to 8.7)    | 3156 (3156 to 3164) | 49.4 (49.1 to 50.1) | 286.7 (284 to 305.4)   | 12.1 (11.2 to 14.1) |
| Event Storming        | webview | 668 (641.8 to 749)     | 9.5 (9.5 to 9.5)    | 3064 (3064 to 3064) | 49 (48.5 to 49.7)   | 295 (285.9 to 296.5)   | 16.4 (14.6 to 19.4) |
| Team Topology         | webapp  | 623.5 (600 to 688.9)   | 8.2 (8.2 to 8.2)    | 2495 (2495 to 2495) | 56.7 (51.7 to 57.1) | 274.3 (272.5 to 275.8) | 11.9 (11.6 to 12)   |
| Team Topology         | webview | 624.2 (608.4 to 738.2) | 9.2 (9.2 to 9.2)    | 2404 (2404 to 2404) | 57 (56.1 to 57.7)   | 279.1 (274.2 to 285.7) | 11.6 (10.8 to 13)   |
| Context Map           | webapp  | 633.2 (628.2 to 658.7) | 8.1 (8.1 to 8.2)    | 3286 (3286 to 3286) | 56.5 (46 to 57.3)   | 279.4 (272.5 to 284.9) | 12.5 (12.2 to 15.5) |
| Context Map           | webview | 665.3 (647.2 to 822.5) | 9.1 (9.1 to 9.1)    | 3195 (3195 to 3195) | 55.9 (53.4 to 57.1) | 281.1 (274 to 293.7)   | 12.5 (11.7 to 15.2) |
| Value Chain           | webapp  | 606.1 (591.9 to 640.9) | 8.6 (8.6 to 8.7)    | 2445 (2445 to 2453) | 57 (48.4 to 58)     | 274.8 (270.1 to 279.2) | 11.7 (11.1 to 12.4) |
| Value Chain           | webview | 608.8 (589.5 to 663.4) | 9.6 (9.5 to 9.6)    | 2346 (2346 to 2346) | 58.4 (55.7 to 58.5) | 271.6 (270.3 to 276)   | 11.5 (11.1 to 13.3) |
| C4 model              | webapp  | 687.6 (670.6 to 725.7) | 10.8 (10.7 to 10.8) | 2967 (2967 to 2967) | 54 (47.2 to 56.3)   | 272.7 (270.2 to 294.3) | 12.5 (9.6 to 14.5)  |
| C4 model              | webview | 724 (685.4 to 772.2)   | 12 (11.9 to 12)     | 2875 (2875 to 2875) | 56.8 (50.1 to 58.3) | 272.1 (271.7 to 272.5) | 12 (11.3 to 12.6)   |
| Business Model Canvas | webapp  | 743.3 (674.8 to 901.5) | 8.7 (8.7 to 8.7)    | 3746 (3746 to 3746) | 35.3 (22.2 to 37.5) | 307.8 (298.5 to 342.6) | 16.9 (12.8 to 17.9) |
| Business Model Canvas | webview | 758.6 (735.3 to 796.3) | 9.7 (9.7 to 9.7)    | 3655 (3655 to 3655) | 37.7 (36.9 to 38.1) | 291.4 (286.2 to 309.8) | 16.9 (16.1 to 17.1) |

### A real VS Code

VS Code 1.146.0 on Linux in the suite's Docker runner, the packed extension, five runs per
board in a sitting, each a VS Code that was just started on a new profile. The boards of 7 and
60 models were run in two sittings, and the tables have all ten runs. The manifest's minimum,
1.96.0, was not run: the plan keeps it for the final numbers.

| From the command that opens the tab, ms | 7 models, 10 runs        | 60 models, 10 runs                   | 200 models, 5 runs        |
| --------------------------------------- | ------------------------ | ------------------------------------ | ------------------------- |
| The webview is shown, cold              | 695.7 (534.9 to 1230)    | 627.6 (534.8 to 2576.4)              | 658.9 (557.8 to 1217.2)   |
| The board has drawn, cold               | 782.8 (572.4 to 1226.3)  | 821.5 (755.3 to 2559.9)              | 1174.2 (1007.1 to 1248.7) |
| **T2**, cold                            | 1155.7 (942.6 to 1374.1) | 1991.8 (1766.7 to 3909.4)            | 5685 (5064.1 to 6249.6)   |
| The webview is shown, warm              | 573.4 (460 to 718.1)     | 711.2 (475.4 to 1134.2)              | 917.3 (485.3 to 971.9)    |
| **T2**, warm                            | 951.5 (814.7 to 1063.1)  | 1943.7 (1768.2 to 3944.8)            | 5342.8 (4871.2 to 5366.3) |
| A pan at rest, cold                     | 12.1 (11 to 13)          | 22.3 (15.4 to 46.4), in 9 of 10 runs | 77 (70.8 to 82.7)         |
| The longest task of the load, cold      | 259 (221 to 357)         | 232.5 (217 to 453)                   | 335 (319 to 373)          |
| Long tasks beyond 50 ms each, cold      | 275.5 (221 to 447)       | 343.5 (295 to 887)                   | 882 (645 to 1056)         |
| The probe was in the page, cold         | 274.7 (233.2 to 1206.5)  | 283.4 (251.3 to 2270.8)              | 349.5 (267.7 to 388.5)    |

| Memory after the cold open                                | 7 models, 10 runs      | 60 models, 10 runs     | 200 models, 5 runs     |
| --------------------------------------------------------- | ---------------------- | ---------------------- | ---------------------- |
| **The webview**: JS heap after a forced collection, MB    | 14.9 (14.9 to 15)      | 24.4 (24.1 to 24.7)    | 44.9 (44.6 to 45.5)    |
| The webview: DOM nodes of its process                     | 2209 (2209 to 2215)    | 16437 (16437 to 16485) | 53991 (53991 to 54009) |
| The webview: elements in the document                     | 1732 (1732 to 1735)    | 13546 (13546 to 13570) | 44729 (44729 to 44738) |
| The webview's renderer process: resident (VmRSS), MB      | 194.9 (194.1 to 200.1) | 278.6 (258 to 286.6)   | 460.3 (447.9 to 466)   |
| The webview's renderer process: proportional (Pss), MB    | 108 (107.5 to 112)     | 192.1 (172.2 to 199.8) | 373.4 (361.7 to 378.9) |
| **The extension host**: resident, MB                      | 208.9 (205.2 to 210.8) | 209.6 (209.4 to 212.1) | 210.6 (210.6 to 212.6) |
| The extension host: JS heap after a forced collection, MB | 43.6 (43.6 to 43.7)    | 44.3 (44.3 to 44.4)    | 45.3 (45.3 to 45.3)    |

| The host's side                                                             | 7 models, 10 runs                      | 60 models, 10 runs                       | 200 models, 5 runs        |
| --------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------- | ------------------------- |
| Text documents VS Code holds after the cold open, the board file among them | 8 (8 to 8)                             | 51 (51 to 51)                            | 51 (51 to 51)             |
| `onDidOpenTextDocument` during the cold open                                | 8 (8 to 8)                             | 61 (61 to 61)                            | 201 (201 to 201)          |
| `onDidCloseTextDocument` during the cold open                               | 0 (0 to 0)                             | 10 (10 to 10)                            | 150 (150 to 150)          |
| The last document is open, ms after the command                             | 750.5 (630 to 883)                     | 827.5 (756 to 1898)                      | 1348 (1166 to 1428)       |
| The first text reaches the page, ms                                         | 825.1 (719 to 1026.6), in 9 of 10 runs | 885.8 (792.7 to 1844.5), in 9 of 10 runs | 1323.2 (1119.4 to 1365.8) |
| The last text reaches the page, ms                                          | 1074 (900.6 to 1275), in 9 of 10 runs  | 1865.5 (1671.9 to 3858), in 9 of 10 runs | 5277.8 (4949.6 to 5824.3) |
| `onDidOpenTextDocument` during the warm open                                | 1 (1 to 1)                             | 11 (11 to 11)                            | 151 (151 to 151)          |
| `onDidCloseTextDocument` during the warm open                               | 0 (0 to 0)                             | 10 (10 to 10)                            | 150 (150 to 150)          |
| The extension host's event loop held at most, ms                            | 20 (5 to 80)                           | 19 (5 to 60)                             | 15 (13 to 34)             |

- **In one run of ten on the boards of 7 and 60 models the probe was in the page late** (after
  1,206.5 ms and 2,270.8 ms): what was ready by then is counted at that moment, so that run's
  T2 is an upper bound.
- **A person sees the board from the moment VS Code shows the webview's frame**, 0.63 to 0.7 s
  after the command in the median. Before it the editor is empty, and no pan reaches the board.
- **The board of 60 models came again in a third sitting**, five runs by the independent check
  with the probe as it stands: T2 cold 1,879 ms (1,804.5 to 2,084) and warm 1,749.4 ms (1,673.7
  to 1,965.1), the webview's heap 24.4 MB (24.2 to 24.4) and 16,437 DOM nodes, its process
  278.2 MB resident, the extension host 44.3 MB of heap and 210.6 MB resident, 51 documents
  held, 61 opened and 10 closed, the last document open after 830 ms (768 to 1,123), the last
  text with the page after 1,835.9 ms (1,768.9 to 2,056), a pan at rest 20.3 ms. Each lies in
  the range of the table but the warm T2, which is 19 ms below it, and the moment the board
  has drawn (657.9 ms against 821.5 ms).
- **T1 in a real VS Code is not in the table.** The walk took 1,204.8 ms at 7 models, 1,998.1
  ms at 60 (in 9 of 10 runs) and 5,856 ms at 200, each about its T2. Those were read by the
  first bench's probe, behind the load's own tasks, from a loop that panned only once the page
  had answered a question
  ([what the first bench took](#what-the-first-bench-took-for-these-and-why-it-was-changed)):
  they are the end of the load and no answer to a pan. In the third sitting, with the probe
  as it stands and the walk's loop as it was, no pan reached the board while it loaded in any
  of five runs: T1 in a real VS Code is **not measured**.
- **A pan at rest takes 77 ms (70.8 to 82.7) at 200 models in VS Code.** The walk's pan is a
  hand's, one event after the other, as the bench's is since its correction. Both places draw
  in software.
- **The extension host grows by 1.7 MB of heap from 7 to 200 models** (43.6 to 45.3 MB after a
  forced collection) and by as much of resident memory (208.9 to 210.6 MB). The webview's process
  holds what the bench's page holds: 44.9 MB of heap and 53,991 DOM nodes at 200 models.

### The host's side: the documents VS Code holds

- **A model's text is a text document of VS Code, and every extension is told of each.** The
  second extension heard `onDidOpenTextDocument` for every model of a board and for the board
  file: 8, 61 and 201 times.
- **VS Code holds at most 50 of them.** As the 51st model is opened it lets go of the oldest:
  10 `onDidCloseTextDocument` during the open of 60 models, 150 during the open of 200, and 51
  documents held afterwards on both (50 models and the board file). The closes come in the
  moment of the opens: on the board of 60 models the first and the last of the ten within 3 ms,
  787 to 790 ms after the command.
- **Three minutes later it lets go of the rest.** Watched for four minutes on the board of 60
  models, the board's tab open and untouched: 50 closes at once, 180.7 s after the first open,
  and one document held from then on, the board file's. The extension keeps each text itself
  and opens a document again for a write
  ([the host half](vscode.md#the-host-half)), so the previews stay as they are.
- **A tab that is closed and opened again opens them again**: 11 opens and 10 closes on the
  board of 60 models, 151 and 150 on the board of 200.
- **What the opens cost another extension was not measured**: the profile had VS Code's
  built-in extensions and no other.

### What a person sees with 200 models

The board opens. In VS Code the editor shows it after 0.66 s, its frames after 1.2 s and the last
preview after 5.7 s; previews come in while the rest is still empty. The first fit stands at the
board's smallest zoom, 10 %, at which the board is 1,436 x 860 px: it is cut at the edges of the
bench's window of 1280 x 800, and more so in VS Code's editor beside its side bar, the group above
the grid and the outer columns are outside, and a preview is 80 px wide. In the bench's window 203
of the 210 nodes are in sight at least in part and 168 whole. Nothing on it can be read: a preview
tells its notation by its shapes and colours and not which model it is. A double-click on a preview
moves the board to 100 % in 0.32 s and arms the model. A pan and a zoom are slow: 17 to 21 frames a second in the bench's script (15.5 to 23.5), and a pan is answered after 103 to 107 ms.

## Where it goes

Each share says how it is known. A **trace** is Chromium's own timeline of the main thread, read
as self time: an event's time without the events inside it. A **profile** is the sampling
profiler (a sample every 0.25 ms) on a build of the webview bundle that is not minified, each
sample mapped through the source map to the package its source is in. Both make a load slower
than a bare one, so their times are shares and no load times. A **scratch build** is the
webview bundle with one source patched in memory while it is bundled: no file of the tree
changed. All of it is sandboxed Chromium on the webview bundle, the median of five runs with
the range, taken in one quiet sitting.

### The load

The main thread until the last preview, by the browser's own events (trace, ms):

| Event                                   | 60 models                 | 200 models                |
| --------------------------------------- | ------------------------- | ------------------------- |
| T2 with the profiler on                 | 1615.5 (1582.7 to 1655.1) | 5862.3 (5818.8 to 6262.5) |
| The main thread's tasks together        | 1530 (1480 to 1549)       | 5805 (5742 to 6159)       |
| Script (`v8.callFunction`)              | 671.4 (643.4 to 684.2)    | 1758.6 (1734.6 to 1846.4) |
| Script (`FunctionCall`)                 | 114.5 (112.4 to 131.5)    | 227.7 (224.9 to 293.1)    |
| Script, the bundle's own run (`v8.run`) | 51.6 (48.4 to 52.9)       | 50.4 (48.1 to 65.9)       |
| Layout                                  | 235.9 (225.9 to 255.2)    | 1316.3 (1306.4 to 1386.4) |
| Style (`UpdateLayoutTree`)              | 163.6 (157.2 to 167.7)    | 534.9 (527 to 564.7)      |
| Layerize                                | 40.1 (38.4 to 49.4)       | 1006.4 (991.5 to 1080.5)  |
| Paint                                   | 47 (44 to 54.8)           | 311.2 (298.2 to 348.7)    |
| PrePaint                                | 29.4 (27.4 to 29.9)       | 220.2 (211.3 to 223.2)    |
| ParseHTML                               | 23.9 (21.3 to 26.1)       | 71.3 (69.8 to 78.9)       |
| Compile (`v8.compile`)                  | 8.7 (8.6 to 9.1)          | not in the first fourteen |

- **Script is a little more than half of a load of 60 models and a third of one of 200.**
  Layout, and at 200 models Layerize, grow faster than the board: 3.3 times the models are 5.6
  times the layout and 25 times the Layerize. Layout is forced from script (below); Layerize is
  paid once per frame over everything that is drawn, and a load of 200 models draws more frames
  over more content.
- **Parsing and compiling the bundle is no share worth naming**: 8.7 ms of compile and 51.6 ms
  for the bundle's own run, of 1,530 ms. The one script of the webview is 2,793,163 bytes, its
  sheet 298,989 bytes. Its first task is the longest of a load, 240 ms (233 to 247) on a board
  of 60 nodes whose texts never come and 299 ms (269 to 348) on the board of seven models: the
  bundle's run and the first mount of the shell and the board in one task. The web app, whose
  build is 45 chunks (the notations' between 64,506 and 476,646 bytes), has 67 ms (55 to 92) as
  its longest task on seven models, and the same T2 as the webview: 999.1 ms against 984.5 ms,
  inside each other's range.
- **The notations' code as chunks** therefore shows in the longest task and not in T1 or T2.
  A warm load of the web app is not faster than a cold one outside the range either (60 models:
  1780.1 ms against 1864.1 ms).

The same load by the package a sample's source is in (profile, self time in ms):

| Part                                 | 60 models              | 200 models                |
| ------------------------------------ | ---------------------- | ------------------------- |
| diagram-js                           | 437.4 (423.3 to 455.7) | 1903.6 (1873.3 to 1967)   |
| The browser's own work (`(program)`) | 276.1 (270.1 to 284.9) | 1977.7 (1968.6 to 2114.7) |
| tiny-svg                             | 99.8 (92.6 to 102.7)   | 338 (324.6 to 360.3)      |
| react-dom                            | 56.6 (53.3 to 66)      | 102.5 (101.8 to 126.6)    |
| C4's renderer and DSL                | 48.2 and 30.2          | 117.3 and 55.8            |
| domify                               | 44.3 (36.6 to 47.4)    | 135.2 (127.1 to 136.6)    |
| React Flow (`@xyflow/react`)         | 34.6 (30.8 to 40.5)    | 89.1 (82.1 to 99.9)       |
| The garbage collector                | 28.7 (28 to 32.6)      | 81.4 (77.7 to 98.4)       |
| yaml and zod                         | 25.9 and 25.6          | 47.1 and 42.9             |
| The other six renderers, each        | 15.2 to 22             | 33.9 to 95                |
| The board's renderer                 | 17.4 (16.5 to 20.3)    | not in the first 22       |
| The board's host package             | not in the first 22    | 26.1 (23.1 to 32.2)       |

- **The board's own code is the smallest share.** The renderer, the host package, the files
  port and the app together stay under 3 % of a load. React Flow's own work with every node
  drawn is 34.6 ms at 60 models and 89.1 ms at 200.
- **Two functions of diagram-js take a fifth of a load, and both are a read of a size while the
  page is dirty.** In the last run of each board `Canvas.getSize` (`diagram-js/lib/core/Canvas.js`,
  which reads the container's `clientWidth` and `clientHeight`) had 203.8 ms of self time at 60
  models and 965 ms at 200, and `Palette._toggleState` (`lib/features/palette/Palette.js`, which
  reads the palette's parent's height to choose one column or two) 123.5 ms and 697 ms. A read
  of a layout size makes the browser lay out everything that changed since the last one, and
  every modeler that mounts changes the page. That is the layout row of the first table. The
  palette's read is made for a palette that a preview does not show.
- **Who asks for the size**, by the chain of callers (profile, five runs). First the host
  package's own first fit, `fit()` in `packages/host/src/embed/embed-modeler.ts`: it reads
  `canvas.getSize()` and then sets `canvas.viewbox(box)`, inside which diagram-js reads the
  size again after it wrote. 91.5 ms (89.6 to 98) and 48.1 ms (45.7 to 62.2) at 60 models, 334.5
  ms (316 to 395.5) and 190.6 ms (184.1 to 237.5) at 200: 2.3 ms and 2.6 ms a preview. It is
  the layout of what the import just drew, which the browser does before its next frame in any
  case; here it is done once per modeler, when the fit asks. Then the palette: 48.4 ms from
  `Palette._layoutChanged`, 26.5 ms from Event Storming's palette provider and 20.9 ms from
  C4's `refreshPalette` at 60 models, 203.4, 82.3 and 72.1 ms at 200. Then Wardley's
  `MapResizeHandles.render` (23.7 and 73.2 ms), React Flow's `updateDimensions`, which measures
  its nodes (24.3 and 72.8 ms), and diagram-js's overlays (10.7 and 49.2 ms).

### One preview, by notation

What one more preview costs: a board of twenty nodes of one notation against a board of ten,
five runs each, per added preview (the bench's numbers, so no profiler):

| Notation              | T2 ms               | The main thread's tasks ms | Heap KB                | DOM nodes | Renderer MB      |
| --------------------- | ------------------- | -------------------------- | ---------------------- | --------- | ---------------- |
| Wardley Map           | 10.7 (8 to 18.1)    | 17.6 (12.6 to 20.6)        | 153.6 (143.4 to 153.6) | 298.6     | 0.9 (0.3 to 1)   |
| Event Storming        | 12.6 (10 to 17)     | 15.7 (14.3 to 16.5)        | 143.4 (133.1 to 143.4) | 276.6     | 1.7 (1.6 to 1.9) |
| Team Topology         | 8.2 (6.2 to 10.9)   | 10.9 (9.4 to 12.3)         | 133.1 (133.1 to 133.1) | 210.6     | 0.8 (0.7 to 0.9) |
| Context Map           | 12.7 (-0.4 to 15)   | 16 (2.3 to 19.7)           | 122.9 (122.9 to 122.9) | 289.6     | 1.1 (0.5 to 1.1) |
| Value Chain           | 8.3 (6 to 15.9)     | 9.3 (7.3 to 18.8)          | 153.6 (143.4 to 153.6) | 204.6     | 0.7 (0.5 to 0.8) |
| C4 model              | 16.7 (7.7 to 20.1)  | 13.8 (9.8 to 19.6)         | 266.2 (266.2 to 276.5) | 257.6     | 0.6 (0.4 to 1.1) |
| Business Model Canvas | 17.4 (14.1 to 58.5) | 23.5 (21.8 to 63.9)        | 133.1 (133.1 to 133.1) | 335.6     | 2.4 (2.1 to 2.9) |

The heap is read to a tenth of a MB, so a step of the heap column is 10.2 KB. A preview is 8 to
17 ms of the load and 123 to 266 KB of heap on a small board. On the board of 200 models T2 is
24.6 ms a preview in the webview (4,922.7 ms for 200): the frames of a large board cost more.

### Memory

- **By the board's size** (webview, cold): 12.6 MB of heap and 2,177 DOM nodes at 7 models,
  22.2 MB and 16,405 at 60, 43 MB and 53,953 at 200. The renderer process holds 192.7, 268.5
  and 449.2 MB.
- **The board without its modelers.** A board whose texts never come has its nodes, their
  frames and their empty editor elements, and no modeler: 10.8 MB of heap and 2,655 DOM nodes at
  60 nodes, 16 MB and 8,143 at 200. So the modelers of 60 previews hold 11.4 MB and 13,750 DOM
  nodes, those of 200 previews 27 MB and 45,810: 190 and 135 KB of heap and 229 DOM nodes each.
- **What a preview gives back when it goes.** Ten nodes of one notation, removed one after the
  other as a person removes them (a click on the header, the Delete key), with the heap after
  two forced collections each time, three runs that agree to 4 KB. The DOM nodes come back
  whole: 3,284 with ten Wardley previews, 391 with none. The heap does not: it is 10,044 KB with
  ten, 10,930 KB after the first is removed (the code a first removal runs is compiled then),
  and 10,548 KB with none, which is 42 KB less per removed preview where one holds 153.6 KB.
  For C4 the heap goes from 12,806 KB after the first removal to 11,358 KB with none, 161 KB
  per preview of the 266.2 KB one holds; for Business Model Canvas from 10,749 KB to 10,476 KB,
  30 KB of 133.1 KB. **What holds the rest was not found**: no heap snapshot was read. Whoever
  lets a modeler go to save memory has to find it first.

### At rest: a pan and a zoom

With every preview drawn, twenty moves of a drag on the pane and twenty wheel steps, 30 ms
apart, under a trace and the profiler:

| The main thread, ms      | 60 models, pan         | 60 models, zoom        | 200 models, pan        | 200 models, zoom          |
| ------------------------ | ---------------------- | ---------------------- | ---------------------- | ------------------------- |
| Its tasks together       | 569 (560 to 583)       | 954 (932 to 982)       | 1849 (1807 to 1867)    | 2551 (2318 to 2583)       |
| Layerize                 | 139.5 (134.2 to 140.5) | 232.1 (226.7 to 246.9) | 899.3 (873.7 to 931.9) | 1208.5 (1113.1 to 1212.8) |
| Paint                    | 38.7 (37.9 to 41.7)    | 66.6 (64.1 to 69.9)    | 190 (183.5 to 191.9)   | 258.5 (238.4 to 268.3)    |
| Hit test                 | 46 (44.8 to 47.3)      | 85.7 (83.4 to 87)      | 103.5 (98.1 to 121.8)  | 284.3 (279.3 to 319.7)    |
| Commit                   | 4.5 (4.2 to 5.1)       | 162.7 (149.6 to 173.2) | 95.8 (91.4 to 104.9)   | 33 (15.6 to 56.3)         |
| Script of every package  | under 10               | under 10               | under 20               | under 20                  |
| The profiler's own start | 215.6                  | 213.1                  | 257.5                  | 262.6                     |

- **Nothing of it is the board's script.** The profile names `(program)`, the browser's own
  work, for 563.4 ms of a pan at 60 models and 1,819.1 ms at 200, and React, React Flow, the
  store and the app with under 5 ms each. One call stands out in a zoom:
  `querySelectorAll`, 28.9 ms at 60 models and 128.1 ms at 200 over the twenty steps. The
  renderer asks the whole board for its two edge layers on every zoom tick
  (`canvas/board-gestures.tsx`, `host.querySelectorAll(ZOOM_AWARE)`).
- **The time is the browser's layerization and painting of what the board draws**, on every
  frame in which the view changes: 7 ms of Layerize per pan step at 60 models and 45 ms at 200.
- **Seven tenths of it are the previews' content.** One more rule in the page that is already drawn,
  `.board-node__body { content-visibility: hidden }`, which keeps every modeler and draws none of
  them: the main thread's tasks for the twenty pan steps fall from 1,687 ms (1,676 to 1,866) to 505
  ms (496 to 728) at 200 models and from 474 ms (335 to 1,020) to 174 ms (163 to 470) at 60, and the
  answer to a pan from 69.5 ms (68.8 to 77.8) to 18.6 ms (18 to 32.6) at 200. The zoom falls from
  2,037 ms to 716 ms at 200.
- **No other rule that was tried helps.** The nodes without their rounded corners, without
  their clip, without their shadow, and with `contain: layout paint style` on React Flow's
  wrapper each stay inside the range of the page as it is (a pan of 68.8 to 70.4 ms at 200).
  `will-change: transform` on React Flow's viewport makes a pan three times slower (209 ms at
  200), and so does a layer per preview (216.1 ms).
- **The previews outside the window still cost, and the browser's own skipping does not help.**
  At the fit a pan takes 30 ms (26.7 to 34.9) at 60 models and 131.5 ms (127.8 to 132.8) at 200
  (the first bench's pan, four events at once, no profiler); at 100 %, where four previews are in the window, 21.2 ms
  (18.2 to 32.5) and 61.9 ms (61.2 to 70.4). With `content-visibility: auto` on the node's body
  from the page's first moment, with which the browser skips a preview outside the window, a
  pan at 100 % takes 22.5 ms and 66.3 ms, and at the fit of 200 models 204.6 ms against
  131.2 ms.
- **The board's own frames are not free.** With 200 nodes whose texts never come, so without
  any preview, a pan at rest takes 46.1 ms (42.5 to 49.6) in the bench, and 13.1 ms (12.4 to
  15.9) with 60.

### The reads

In VS Code a model's text is a text document, opened by `workspace.openTextDocument`. The
files server's limit of four reads at once (`READS_AT_ONCE`) is for the bytes of pictures; the
texts of different models are opened side by side. The last document of a board of 60 models
is open 827.5 ms (756 to 1,898) after the command that opened the board, the last of 200
models after 1,348 ms (1,166 to 1,428). The page gets its first text at 885.8 ms and 1,323.2 ms
and its last at 1,865.5 ms and 5,277.8 ms: by then the texts wait for the page, which mounts a
modeler for each as it comes. The extension host's event loop was never held longer than 80 ms
during a load. So the reads are no share of T2, and their order is no lever on it.

### Tried on a scratch build

Each against the tree as it is, in turns run by run, five runs each:

| What was tried                                                                                                | 60 models                                                                                                                                                                                               | 200 models                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The mounts spread**: one modeler is made and imports its text at a time, with a task or a frame between two | T2 1,547.6 ms as it is, 2,329.6 ms with a task between, 2,437.7 ms with a frame between. The slowest pan of the load 63.5 ms (61.8 to 906.6) as it is, 82.8 ms (80 to 84.6) and 86.6 ms (81.6 to 101.7) | T2 4,703.9 ms (4,662.8 to 4,800.5) as it is, 25,918.4 ms and 25,918.6 ms spread. The slowest pan 3,498.2 ms (230.5 to 3,560.8) as it is, 251.3 ms and 265.9 ms                                                            |
| **Every preview its renderer's viewer**, not its modeler                                                      | T2 1,542.9 ms as it is, 1,580.6 ms (1,219.3 to 1,997.6). Heap 22.2 MB against 17.9 MB, DOM nodes 16,405 against 13,114                                                                                  | T2 6,075.4 ms (5,296.3 to 6,744.7) as it is, 4,788.8 ms (3,976 to 5,541). Heap 43 MB against 32.9 MB, DOM nodes 53,953 against 43,062, a pan at rest 162.2 ms against 132.8 ms                                            |
| **React Flow's `onlyRenderVisibleElements`**                                                                  | not tried                                                                                                                                                                                               | 200 of 200 previews are mounted either way: at the first fit every node touches the window. Heap 42.5 MB against 43.2 MB                                                                                                  |
| **A containment rule on the modeler's element from the first moment**                                         | T2 1,839.2 ms (1,490.6 to 1,991.6) as it is, 1,548 to 1,598.2 ms under four rules, with runs up to 2,186.6 ms: inside the range                                                                         | T2 5,141.3 ms (4,810 to 6,646.3) as it is, 4,797.3 to 5,071.7 ms under the rules. Layout 478.5 ms (434.2 to 604) against 391.3 ms (386.3 to 450.1) with `contain: strict` on the modeler's own element, ranges that touch |

- **Spreading the mounts costs what it is meant to save.** Between two mounts the browser draws
  a frame, and a frame costs what a pan costs: little on a small board, 0.1 s and more on a
  board of 200 models. As the tree is, the texts arrive as tasks one behind the other and the
  browser draws few frames between them. Spread, T2 is half as long again at 60 models and five
  and a half times as long at 200. The pans of this table were read by the first bench's
  probe, behind the load's own tasks, and say nothing; with the bench as it stands every pan
  of a load of 60 models is answered in time as the tree is.
- **A viewer saves a fifth of the heap and of the DOM** and nothing of T2 at 60 models. At 200
  it is 1.3 s faster in the median, with ranges that overlap.

### What the check tried to refute

The independent check took the three largest shares above and tried each with an experiment of
its own, on scratch builds of the webview bundle in sandboxed Chromium, in turns with the tree
as it is, three runs each in one sitting unless said otherwise.

- **"The load is the modelers' own work."** A scratch build with a modeler of the contract that
  draws one rectangle in the place of every notation's modeler, everything else as it is. The
  last preview of 60 models is drawn after 647.3 ms (624.8 to 685) where it takes 1,663.2 ms
  (1,529.7 to 1,760.6), with the board drawn after 489.3 ms and 673.2 ms: what is left between
  the two is about 158 ms, against 990 ms. Of 200 models 945.2 ms (936.1 to 1,099) against
  5,061.9 ms (4,744 to 5,442.2), drawn after 742 ms and 884.8 ms. The heap is 9.6 MB against
  22.2 MB and 15.9 MB against 43 MB, a pan at rest 46.9 ms (45.4 to 53) at 200 nodes. **Not
  refuted**: the board, the host package, the files port and the stand-in together are a
  sixth of a load of 60 models after the board has drawn, and a twentieth of one of 200.
- **"Two functions of diagram-js take a fifth of a load, a read of a size while the page is
  dirty."** A scratch build in which `Canvas.getSize` answers the known size of a bench node's
  canvas and reads nothing, and the host package's first fit with it. Layout falls from 135.7
  ms (123.2 to 149.7) to 119 ms (117.1 to 136.2) at 60 models and from 528.9 ms (479 to 543.9)
  to 444.7 ms (437 to 474.4) at 200; T2 does not move outside the range (1,654.2 ms against
  1,663.2 ms, 4,958 ms against 5,061.9 ms). **The profile is right and it is no lever**: the
  965 ms of self time at 200 models are layout that is due in any case, and 84 ms of them go
  when the read goes. Without any first fit T2 is 1,531.9 ms (1,511 to 1,546.9) and 4,527 ms
  (4,338.2 to 4,564.7), a twelfth to a tenth less, for a preview that shows its content in
  another place.
- **"At rest seven tenths are the previews' content."** The previews switched off another way,
  `display: none` on the modeler's own element in the drawn page, and halved, every second
  node: a move of a held drag at 200 models takes 30.8 ms (28.7 to 33.6) and 54.7 ms (47.3 to 59.1) where it takes 89.9 ms (83.4 to 95.5), five runs; at 60 models 15.4 and 17 ms against 25.8 ms, three runs. `content-visibility: hidden` gives 29.6 ms (29.5 to 33.3), as the measuring phase found. **Not refuted**: two thirds, by another rule. The previews without their text, which is too small to read there, bring a seventh (77 ms). A bitmap of each preview in its place, a PNG of twice the preview's size on screen, costs what nothing costs: 32.6 ms (30.7 to 33.2).

### The candidate, tried as the rule it would be

`content-visibility: hidden` on the modeler's own element (`.board-engine > .board-host-editor`)
from the page's first moment, on the boards as the bench loads them, in turns with the tree as
it is, the bench as it stands: five runs at 200 models, three at 60.

| Webview bundle, cold                  | 200 models as it is       | 200 models, not rendered    | 60 models as it is        | 60 models, not rendered   |
| ------------------------------------- | ------------------------- | --------------------------- | ------------------------- | ------------------------- |
| T2 ms                                 | 6006.3 (5463.3 to 8008.6) | 4698.9 (4144.5 to 5323.7)   | 2019.9 (1729.8 to 2037.3) | 1758.4 (1657.5 to 1854.6) |
| A pan at rest ms                      | 133.8 (131.3 to 147.4)    | 43.6 (36.5 to 48.3)         | 27.9 (25.7 to 29.1)       | 17.6 (16.5 to 19.7)       |
| Pans of the load, and of them in time | 14 (14 to 16), 2 (1 to 2) | 15 (13 to 17), 11 (6 to 16) | 9 (8 to 10), all          | 8 (7 to 9), all           |
| Median pan of the load ms             | 143.8 (129.1 to 155.3)    | 89.7 (76.5 to 108.7)        | 27.9 (19.2 to 28.8)       | 21.8 (21.7 to 32.2)       |
| Slowest pan of the load ms            | 246.4 (208.4 to 261)      | 119.6 (102.7 to 209.3)      | 40.4 (35.4 to 48.3)       | 39.2 (35.6 to 84.1)       |
| T2 under pans ms                      | 7910.2 (7053.2 to 8321.1) | 6621.6 (5117.8 to 6960.4)   | 2712 (2416.5 to 2886.4)   | 2499 (2326.8 to 2777.4)   |
| Long tasks beyond 50 ms each ms       | 1025 (941 to 1558)        | 774 (424 to 863)            | 393 (329 to 401)          | 358 (302 to 379)          |
| Heap MB                               | 43 (42.9 to 43.1)         | 43 (42.9 to 43)             | 22.2 (22.2 to 22.2)       | 22.2 (22.2 to 22.3)       |
| Yardstick on six threads ms           | 685.5 (614.3 to 843.7)    | 648.2 (486 to 707.4)        | 730.1 (609.3 to 1023.9)   | 569.6 (565.1 to 689.2)    |

- **At 200 models the gain is outside the range** for T2, for a pan at rest and for the pans of
  the load: a pan at rest in a third of the time, the last preview 1.3 s earlier, and 11 of 15
  pans of the load answered in time where 2 of 14 are. The sitting was a slower one than that
  of the tables above, as its yardstick says. At 60 models the board is fine without it.
- **A modeler that imports its text while it is not rendered draws the same picture once it
  is.** The rule was taken out of the page after the load and every drawn shape's and every
  text's box was held against the page that loaded as it is, to a quarter of a px: of 200
  nodes and of 60 nodes, none differs, the seven notations among them.
- **The frame that brings the previews back** costs 195.2 ms (174.5 to 234.1) at 200 models at
  the fit and 52.1 ms (41.1 to 63.5) at 60; after a model was armed from the fit, with the
  board at 100 %, 141.5 ms (133.4 to 206.5) and 48.8 ms (43.7 to 58.5). The frame that takes
  them away costs 70.4 ms and 19.8 ms. With the node's name in large type in the preview's
  place a move of a held drag takes 37.7 ms (35.1 to 41.5) where it takes 32.8 ms without, at
  200 models on a busy machine. `visibility: hidden`, which keeps the layout, takes 44.2 ms.

## The repository's side

Second in rank (the lead's P4): a repository of 22,002 files, 2,000 of them models, with a board
on seven of them, and a burst of 5,000 file events on the open board (4,000 files change, 500
go, 500 come, as a branch that is switched). Five runs each.

| What                                                    | The fake VS Code, in Node                                                | A real VS Code 1.146.0                                                   | The webview page in Chromium                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| The list is with the page                               | 133.4 ms after the hello (129.7 to 160.1)                                | 557.1 ms after the command (536.7 to 702.9)                              | not a number of the page                                                                             |
| The list message                                        | 2,001 paths, 87,494 bytes                                                | 2,001 paths, 87,494 bytes                                                | 2,007 models, 87,763 bytes                                                                           |
| The picker holds 2,000 models                           | no page                                                                  | 946.9 ms after the command (906 to 1,076.7)                              | 360.4 ms after the list came (356 to 381.7)                                                          |
| The page's longest task for one list                    | no page                                                                  | 309 ms after the burst (297 to 312)                                      | 308 ms (304 to 326)                                                                                  |
| Searches (`findFiles`) and `stat` calls at the open     | 2 and 1                                                                  | not counted                                                              | no host                                                                                              |
| A click with 7 models in the picker, and with 2,000     | no page                                                                  | the pointer events of one: 32 to 40 ms with 2,000                        | 24 ms and 32 ms                                                                                      |
| The burst: list messages to the page                    | 1 (87,682 bytes), 2 searches, no `stat`                                  | 1 (87,682 bytes)                                                         | fifty lists in a row: shown after 12,383.5 ms (12,128.1 to 13,231.9), the page blocked for 11,336 ms |
| The burst: the last list, after its first event         | 1,214.1 ms (1,186.9 to 1,354.1), the fake fires the events in 1,115.5 ms | 838.7 ms (817.9 to 860.6), the files were written in 353 ms (339 to 384) | no host                                                                                              |
| The burst: the extension host's event loop held at most | no event loop                                                            | 133 ms (121 to 140), no "UNRESPONSIVE" line in VS Code's log             | no host                                                                                              |

- **The list is no weight on the wire**: 87 KB for 2,000 models, once per burst. The index
  answers 5,000 events with one list and two searches, on the fake and in a real VS Code. The
  fake's search is a loop over a map, so its 133 ms are the index's own work and not VS Code's
  search; in a real VS Code the list is with the page 0.56 s after the command that opens the
  board.
- **Each list costs the page 0.3 s, and 268 ms of them are one function of the host package.**
  A profile of one list of 2,007 models reaching the page (five runs): `titleOf` in
  `packages/host/src/host/models.ts` has 211.6 ms of self time (206.1 to 227.6) and its two
  closures 32.8 and 23.3 ms; React takes 16.2 ms for the 2,000 options. `titleOf` builds, for
  each listed model, a list of all the others to see whether one shares its name: two thousand
  times two thousand. The same task is paid when a board opens. A host that told its lists
  without a rest would block the page for as long as they come: fifty in a row, 11.3 s.
- **The picker with 2,000 entries** is a `select` with 2,000 options. A click that draws the
  toolbar again costs 32 ms with them and 24 ms with seven. What a person meets when they open
  it, a list of 2,000 file names in the order of their paths, was not measured: the bench does
  not open the browser's own popup.
- **Memory**: the extension host is at 250 MB resident (248 to 252) and 44 MB of heap on the
  large repository, against 209 MB and 43.6 MB on the board of seven models in a small one.

## What the numbers ask for

Nothing is built that no number asks for (the lead's P5). The verdict is the independent
check's, on the tables above. The board of 60 models, the plan's number, asks for nothing: it
is drawn after 1.5 s, answers a pan from 0.8 s on and holds 22 MB. The board of 200 models,
which was measured to see where it breaks, breaks at one place: once its modelers come it does
not answer a pan within 100 ms, 131 to 235 ms while it loads and 103 to 107 ms at rest.

**Asked for, and not built yet:**

1. **A board that is zoomed far out does not render its previews, and each node says its
   file's name** (the lead's "a preview that is far away or too small to read lets its modeler
   go and keeps its picture", narrowed twice: the modeler stays, and the picture is the name).
   The number that asks: a pan at rest at 200 models, 103.1 ms and 107 ms. Tried as the rule
   it would be: 43.6 ms against 133.8 ms, T2 4,698.9 ms against 6,006.3 ms, 11 of 15 pans of the load in time against 2 of 14. The board says that it is far out below a zoom of 12 %,
   where a node of the example's width is under 96 px on screen, and brings the previews back
   from 14 % on once the view has rested. In the bench's window of 1280 x 800 the board of 60
   models fits at 13.6 % and the board of seven at 29 %, so neither rests at its fit; in a
   narrower editor a board of 60 models may. The modeler stays mounted and bound, so a
   node is the same node to a person and to the host whatever it shows: nothing of P6 is
   touched but the look. It changes what a person sees on a large board and goes to the owner
   with two pictures of the board of 200 models at its fit, with previews and with names.
   Not built of it: the modeler let go (the memory is not what breaks: 43 MB at 200 models,
   and a removed preview gave back a quarter to six tenths of its heap), and a picture of the
   preview in the name's place. A bitmap costs nothing at rest, but the contract has no call
   for a picture, a modeler's own export is its app's, and a picture has to follow every text
   that changes.
2. **The fit of a board whose nodes lie further apart than the smallest zoom shows a node**
   (increment 4's note). No number of the bench asks for it, and the check asks for it all the same: the
   board of 200 models was looked at first. At its fit it stands at 10 % and is 1,436 x 860 px
   in a window of 1280 x 800: 203 of its 210 nodes are in the window at least in part and 168
   whole, the outer columns and the last row are cut, and the group above the grid lies under
   the toolbar. No fit can show it whole, since the board's smallest zoom is the renderer's.
   What the fit can decide is which part is shown: where the middle of such a board is empty,
   today's fit shows nothing. The fit would then show the node nearest the middle; a board
   like this one, whose middle has nodes, would keep the view it has today.
3. **The model list's titles in one pass** (the repository's side, new). One list of 2,007
   models costs the page a long task of 325 ms (316 to 409) and is shown after 380.5 ms (369.4
   to 471.5); on a scratch build that counts the names once, 51 ms (0 to 54) and 93.4 ms (91.4
   to 97.4), with the same 2,008 titles, five runs in turns. It shows only in a repository
   with thousands of models.

**Not asked for**, each with its number:

4. **Each preview its renderer's viewer** (from the profile). A fifth less heap and DOM (22.2
   MB against 17.9 MB at 60 models, 43 MB against 32.9 MB at 200), T2 the same at 60 models
   and inside the range at 200. No number asks for memory, and it is the widest change against
   P6: arming would swap one object for another under a gesture.
5. **The documents in VS Code** (the host's side). The reads are done 0.83 s and 1.35 s after
   the command and the extension host grows by 1.7 MB: no number of T1, T2 or M asks. What
   stands is that every extension is told of every model of a board, 201 opens and 150 closes
   for 200 models. What that costs another extension was not measured. The owner's to weigh.
6. **The mounts spread over idle time** (the lead's). The page already answers while 60
   models come: every pan of the load in time in the webview bundle, the slowest 53.3 ms. At
   200 models a scratch build with a task or a frame between two mounts took 25.9 s where the
   tree takes 4.7 s, because every frame between two mounts costs what a pan costs. With the
   previews not rendered a frame is cheap, and 11 of 15 pans of the load are in time without any spreading.
7. **A modeler mounted only when its node is near the window** (the plan's and the lead's). At
   the first fit every node is in the window: with React Flow's own rule 200 of 200 previews
   were mounted. After a zoom to 100 % the browser's own skipping of what is outside
   (`content-visibility: auto`) changes nothing (66.3 ms against 61.9 ms a pan at 200 models).
8. **The reads serve the nodes in view first** (the lead's). The reads are no share of T2: in
   VS Code the last document is open after 0.83 s and 1.35 s, and the page gets its last text
   at 1.9 s and 5.3 s because it is busy.
9. **The notations a board names are warmed when the page is idle** (the plan's and the
   lead's). The webview has one script; in the web app a warm load is not faster than a cold
   one outside the range (60 models: 1,406.7 ms against 1,468.5 ms).
10. **ES module chunks in the webview** (the plan's, which needs an option of the shell). The
    web app has chunks and the webview has one script, and their T2 is the same at 7 and at 60
    models (746.1 and 712.6 ms, 1,468.5 and 1,458.4 ms). The one script's first task is 0.24 s
    where the web app's longest is 0.06 s at 7 models. Not tried on a scratch copy.
11. **The texts of a board handed to the page together** (new, from the two places). The web
    app, whose repository answers in fewer and longer tasks, has the last preview of 200 models
    after 3,369.7 ms where the webview has it after 4,590.4 ms: the frames between the texts
    cost a quarter of the load. No number asks for it, and its price is the pans of the load,
    which the web app answers in 73.4 ms at 60 models where the webview takes 22.5 ms. With
    the previews not rendered the frames are cheap in either place.

### Outside the board's own code

Each with the exact change, for its owner. None was made.

- **diagram-js, `Palette._toggleState`** reads its parent's height on every layout change and
  rebuild, also when the palette is not shown: 95.8 ms of a load of 60 models and 357.8 ms of
  one of 200 (the three chains above). A modeler that is embedded as a preview could come
  without its palette, by an option of each renderer's factory or by a palette that does not
  measure while hidden. Tried on a scratch build by taking each renderer's viewer (the table
  above).
- **The board's renderer, the zoom tick** (`packages/renderer/src/canvas/board-gestures.tsx`):
  `host.querySelectorAll(ZOOM_AWARE)` runs on every zoom tick over the whole board, 128.1 ms of
  twenty wheel steps at 200 models and 28.9 ms at 60. The two edge layers could be kept and
  asked for again only when one is no longer connected. The gain is the call's own time; it was
  not tried on a scratch copy.
- **The board's renderer, `onlyRenderVisibleElements`** (`canvas/board.tsx`): tried on a
  scratch build with `true`. At the first fit of 200 models all 200 previews are mounted, the
  heap is 43.2 MB against 42.5 MB and a pan at rest 222.3 ms against 238.9 ms, inside each
  other's range. It unmounts a node that leaves the window and its editor with it, which the
  renderer's own comment forbids.
- **The board's renderer, its frames**: 200 nodes without any preview cost 46.1 ms a pan and
  16 MB of heap. What in a frame costs it was not profiled.
- **The shell, `renderWebviewHtml` with a module option** (the plan's): see candidate 10.
- **diagram-js, `Canvas.getSize`**: no change is named. The read that the profile charges with
  203.8 ms at 60 models and 965 ms at 200 was switched off on a scratch build, and 17 ms and
  84 ms of layout went with it and nothing of T2
  ([What the check tried to refute](#what-the-check-tried-to-refute)).
- **The board's renderer, the steps of `data-board-view`** (`canvas/board-gestures.tsx`,
  `viewOf`: near from 75 %, mid from 40 %, far below): a step below 12 % would let a host's
  sheet rest its previews without a watch of the view. Not needed: the app that mounts the
  board has that watch.
- **Wardley Maps, `MapResizeHandles.render`** reads the canvas's viewbox, and with it its
  size, on every render: 23.7 ms of a load of 60 models, 73.2 ms of one of 200. **Event
  Storming's palette provider** and **C4's `ViewService.refreshPalette`** rebuild and open the
  palette during the import: 26.5 and 20.9 ms at 60 models, 82.3 and 72.1 ms at 200.
- **VS Code** holds 50 documents that an extension opened and no editor shows, and lets go of
  one after three minutes. Seen in 1.146.0; both are VS Code's own.

## Not measured

- **A real VS Code 1.96.0**, the manifest's minimum: the plan keeps it for the final numbers.
- **T1 and the pans of a load in a real VS Code.** The walk took them with the first bench's
  probe and loop, and they are struck. The scripted pan and zoom, the frames and the arming
  were never taken there.
- **The previews not rendered, anywhere but in the webview bundle in sandboxed Chromium**: not
  in the web app's build, not in a real VS Code.
- **A graphics card**: headless Chromium and the container's VS Code both draw in software. A
  pan at rest is the number that would differ most, and it is the number that asks for the one
  change that a person sees.
- **What holds the heap of a preview that was removed**: no heap snapshot was read.
- **What 200 opened and closed documents cost another extension** in VS Code, a language
  server for one: no such extension was installed.
- **The picker opened by a person** with 2,000 entries: the browser's own popup.
- **Any browser but Chromium, and any machine but this one.**
- **A board with pictures in number**: the boards have one. The limit of four reads at once is
  for them.
- **A board of other shapes**: nodes of other sizes, models far larger than the example's, two
  nodes on one file, nodes in groups, and a board whose middle is empty.
- **The web app on a network**: the bench's server is on the machine itself.
- **T1 of the boards of ten nodes of one notation**, with the bench as it stands.
- **Any change**: nothing was built, so there is no "after" in this document.
