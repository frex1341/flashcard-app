// main.js
// フラッシュカードアプリのメインスクリプト
// IndexedDBを使ってデッキとカードのデータを管理

let db = null;
const DB_VERSION = 1; // IndexedDBのバージョン
const DB_NAME = "FlashcardDB"; // IndexedDBのデータベース名
const DECK_STORE = "decks"; // デッキのデータを保存するストア名
const CARD_STORE = "cards"; // カードのデータを保存するストア名
//デッキ管理用の変数
let selectedDeckId = null; // 選択中のデッキID
let currentPage = 1;     // 現在のページ番号
const itemsPerPage = 10; // 1ページあたり何件表示するか
//カード管理用の変数
let showingCardFront = true; // カードが現在表かどうか
let currentCardList = []; // 現在のカードリスト
let currentCardIndex = 0; // 現在のカードのインデックス
let currentLapseList = [];
let lapseCount = 0;
let selectedMode = "learning"; // 選択中のモード（テスト、学習など）
let selectedRepeat = "allRepeat";
let selectedOrder = "number";
let selectedReverse = "normal"
let startClockTime = 0;
let currentDeckNextReview;
let currentDeckLastReview;
let isNotInitialCard = false;

//=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>
//=>=>=>=>=>=>=>=>=>=>  全体の処理に関するもの

  let isDark = false;

  function switchTheme() {
    const link = document.getElementById("themeStylesheet");
    if (isDark) {
      link.href = "style2.css";
    } else {
      link.href = "style.css";
    }
    isDark = !isDark;
  }

/////////////////////////
// 初期化に関係する処理

  // 初期化処理
  (async function() {
    try {
      console.log("初期化開始処理実行")
      const allDecks = await loadAllDecks();
      if (allDecks.length === 0) {
        console.log("デッキがまだありません。サンプルデッキを表示します。");
        showSampleDecks(); // サンプルデッキを表示
      } else {
        console.log("既存のデッキを読み込みました", allDecks);
      }
      renderDeckPage(1, allDecks);  // allDecksを渡して描画
    } catch (error) {
      console.error("デッキの読み込みまたは描画でエラー", error);
    }
  })();

  // サンプルデッキを表示する関数
  async function showSampleDecks() { 
    //例：サンプルのデッキデータ（実際はDBから読み込む）
    let sampleDecks = [
      {id:1, name:"デッキ1"}, 
      {id:2, name:"デッキ2"},
      {id:3, name:"デッキ3"},
      {id:4, name:"デッキ4"},
      {id:5, name:"デッキ5"},
    ];
    try {
      const store = await getDeckStore();
      for (const deck of sampleDecks) {
        store.add(deck);
      }

      tx.oncomplete = () => {
        console.log("サンプルデッキを保存しました");
      };

      tx.onerror = (e) => {
        console.error("サンプルデッキの保存中にエラー", e.target.error);
      };

    } catch(err) {
      console.error("サンプル処理中にエラー")
    }
  }

  //　initDBでIndexedDBを毎回取得する
  function initDB() { 
    return new Promise((resolve, reject) => {
      if (db) {
        console.log("既存のdbを読み込みました")
        return resolve(db);
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        console.log("アップグレードinitDB");
        db = event.target.result;

        // デッキ用ストアがまだない場合は作成
        if (!db.objectStoreNames.contains(DECK_STORE)) {
          const store = db.createObjectStore(DECK_STORE, {
            keyPath: "id",
            autoIncrement: true
          });
          // 必要ならインデックスも作れる
          store.createIndex("nextReviewDate", "nextReviewDate", { unique: false });
        }
        // カード用ストアがまだない場合は作成
        if (!db.objectStoreNames.contains(CARD_STORE)) {
          const cardStore = db.createObjectStore(CARD_STORE, {
            keyPath: "id",
            autoIncrement: true
          });

          // デッキIDでカードを検索できるようにインデックスを作成
          cardStore.createIndex("deckId", "deckId", { unique: false });
        }
      };

      request.onsuccess = (event) => {
        console.log("サクセスinitDB");
        db = event.target.result;
        resolve(db);
      };

      request.onerror = (event) => {
        console.log("エラーinitDB");
        reject(event.target.error);
      };
    });
  }

  //　awaitするための関数
  function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  //　buttonを作成するための関数
  function createButton(text, className, onClick) {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.classList.add(className);
  btn.addEventListener("click", onClick);
  return btn;
  }

/////////////////////////

/////////////////////////
// 時間に関係する汎用処理

  //　日本時間を取得するための関数
  function getJapanTime(date = new Date()) {
  return new Date(date.getTime());
  }

  // 日本時間でtoday判定するための関数
  function getDaysBetweenDates(date1, date2) {
    if (!(date1 instanceof Date) || !(date2 instanceof Date)) return null;
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    const diffTime = d2 - d1;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  // 表示用の時間関数
  function dateToShow(date) {
    if (date === null) {return;}
    return `${date.getFullYear()}年 ${1 + date.getMonth()}月 ${date.getDate()}日`;
  }
/////////////////////////

/////////////////////////
// 共通のdb処理に関係する汎用処理

  //　deckstoreを取得するための関数
  async function getDeckStore(mode = "readwrite") {
    const db = await initDB();
    return db.transaction(DECK_STORE, mode).objectStore(DECK_STORE);
  }

  //　cardstoreを取得するための関数
  async function getCardStore(mode = "readwrite") {
    const db = await initDB();
    return db.transaction(CARD_STORE, mode).objectStore(CARD_STORE);
  }

/////////////////////////

//>|>|>|>|>|>|>|>|>|>|
//>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|



//=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>
//=>=>=>=>=>=>=>=>=>=>  デッキセクション

/////////////////////////
// デッキセクション

  // 全デッキの取得
  async function loadAllDecks() {
    console.log("loadAllDecks開始");
    try {
      const store = await getDeckStore();
      return new Promise((resolve, reject) => {
        const request = store.getAll();

        request.onsuccess = () => {
          console.log("loadAllDecksサクセス");
          const allData = request.result;
          allData.sort((a, b) => new Date(a.nextReviewDate) - new Date(b.nextReviewDate));
          resolve(allData);
        };

        request.onerror = () => {
          console.error("loadAllDecksエラー:", request.error);
          reject(request.error);
        };
      });
    } catch (tryerror) {
      console.error("getDeckStoreエラー:", tryerror);
      return Promise.reject(tryerror);
    }
  }

  // 削除工程のまとめ
  async function deleteProcess(deckId) {
    await deleteDeck(deckId);
    await deleteCardsForDeck(deckId);
    await loadAllDecks().then(() => renderDeckPage(1));
  }
  
  // 選択デッキの削除
  async function deleteDeck(deckId) {
    try {
      const store = await getDeckStore();
      return new Promise((resolve, reject) => {
        const request = store.delete(deckId);
        request.onsuccess = () => {
          console.log(`デッキ ${deckId} を削除しました`);
          resolve();
        };
        request.onerror = () => {
          console.error(`デッキ ${deckId} の削除に失敗しました`, request.error);
          reject(request.error);
        };
      });
    } catch (tryerror) {
      console.error("getDeckStoreエラー:", tryerror);
      return Promise.reject(tryerror);
    }
  }

  // 選択デッキの削除後の紐づけられたカードの削除
  async function deleteCardsForDeck(deckId) {
    try {
      const store = await getCardStore();
      return new Promise((resolve, reject) => {
        const index = store.index("deckId");
        const request = index.getAll(IDBKeyRange.only(deckId));
        request.onsuccess = () => {
          const cards = request.result;
          if (cards.length === 0) {
            console.log(`デッキ ${deckId} に紐づくカードはありません`);
            resolve();
            return;
          }
          const deletePromises = cards.map(card => {
            return new Promise((resolve, reject) => {
              const deleteRequest = store.delete(card.id);
              deleteRequest.onsuccess = () => {
                console.log(`カード ${card.id} を削除しました`);
                resolve();
              };
              deleteRequest.onerror = () => {
                console.error(`カード ${card.id} の削除に失敗しました`, deleteRequest.error);
                reject(deleteRequest.error);
              };
            });
          });
          Promise.all(deletePromises)
            .then(() => {
              console.log(`デッキ ${deckId} に紐づくすべてのカードを削除しました`);
              resolve();
            })
            .catch(error => { 
              console.error(`デッキ ${deckId} に紐づくカードの削除中にエラー`, error);
              reject(error);
            });
        };
        request.onerror = () => {
          console.error(`デッキ ${deckId} に紐づくカードの取得に失敗しました`, request.error);
          reject(request.error);
        };
      });
    } catch (tryerror) {
      console.error("getCardStoreエラー:", tryerror);
      return Promise.reject(tryerror);
    }
  }

  // ページの前移動
  document.getElementById("prevPageBtn").addEventListener("click", () => {
    if (currentPage > 1) {
      renderDeckPage(currentPage - 1);
    }
  });

  // ページの後移動
  document.getElementById("nextPageBtn").addEventListener("click", async () => {
    try {
      const store = await getDeckStore();
      const request = store.getAll();
      request.onsuccess = () => {
        const allDecks = request.result;
        const maxPage = Math.ceil(allDecks.length / itemsPerPage);
        if (currentPage < maxPage) {
          renderDeckPage(currentPage + 1);
        }
      }
      request.onerror = () => {
        console.error("デッキの取得に失敗しました", request.error);
      } 
    } catch (tryerror) {
        console.error("getDeckStoreエラー:", tryerror);
        return Promise.reject(tryerror);
    }
  });

  // 新規デッキ
  document.getElementById("createDeckBtn").addEventListener("click", async () => {
    const deckName = document.getElementById("deckNameInput").value.trim();
    if (!deckName) {
      alert("デッキ名を入力してください");
      return;
    }

    const deck = {
      name: deckName,
      cardCount: 0, // カード数
      reviewCount: 0, // 復習回数
      lastReviewDate: null, // 最後の復習日
      maxTimeSecond: 0, // 最大計測時間（秒）
      currentTimeSecond: 0, // 最近計測時間（秒）
      createdDate: getJapanTime(),
      updatedDate: getJapanTime(),
      nextReviewDate: getJapanTime() // 今日の日付を設定
    };

    try {
      const store = await getDeckStore();
      const request = store.add(deck);

      request.onsuccess = () => {
        console.log("デッキを追加しました:", deck);
        document.getElementById("deckNameInput").value = "";
        loadAllDecks().then(() => renderDeckPage(1));
      };

      request.onerror = (e) => {
        console.error("デッキの追加に失敗:", e.target.error);
        alert("デッキの追加に失敗しました");
      };
    } catch (err) {
      console.error("デッキ追加中の致命的なエラー:", err);
      alert("予期しないエラーが発生しました");
    }
  });
/////////////////////////

/////////////////////////
//  デッキ再表示
  async function renderDeckPage(page) {
    currentPage = page;
    try {
      const allDecks = await loadAllDecks();
      const start = (page - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      const decksToShow = allDecks.slice(start, end);
      renderDeckList(decksToShow);
      document.getElementById("currentPage").textContent = `ページ ${page}`;
    } catch (error) {
      console.error("デッキ表示でエラーが発生しました", error);
    }
  }

  function renderDeckList(decks) {
    const deckList = document.getElementById("deckList");
    deckList.innerHTML = "";
    
    decks.forEach(deck => {
      const li = document.createElement("li");
      const daysLeft = getDaysBetweenDates(getJapanTime(), deck.nextReviewDate);

      const span = document.createElement("span");
      const setsuyakuRaw = 1 - deck.currentTimeSecond / deck.maxTimeSecond;
      const setsuyaku = deck.maxTimeSecond > 0 ? (100 * setsuyakuRaw).toFixed(1): "0.0";
      span.textContent = `📘 ${deck.name}（あと ${daysLeft} 日）, 節約率 ${setsuyaku}%`;
      span.style.marginRight = "10px";
      span.addEventListener("click", () => {cardSectionInitialize(deck.id);});

      if (daysLeft < 0) {li.classList.add("overdue");}
      if (daysLeft === 0) {li.classList.add("due-today");}

      const detailBtn = createButton("詳細", "blue-btn", () => {cardSectionInitialize(deck.id);});

      const deleteBtn = createButton("削除", "red-btn", () => {
        const confirmDelete = confirm(`「${deck.name}」を削除してもよいですか？`);
        if (confirmDelete) {deleteProcess(deck.id);}
      });
      deleteBtn.id = "deckListDeleteBtn";

      li.appendChild(span);
      li.appendChild(detailBtn);
      li.appendChild(deleteBtn);

      deckList.appendChild(li);
    });
  }
/////////////////////////

//>|>|>|>|>|>|>|>|>|>|
//>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|



//=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>
//=>=>=>=>=>=>=>=>=>=>  カードセクション

/////////////////////////
//  最初のカード表示
  async function cardSectionInitialize(deckId) {
    console.log("cardSectionInitializeStart");
    const store = await getDeckStore();
    const deck = await promisifyRequest(store.get(deckId));
    selectedDeckId = deck.id;
    showingCardFront = true;
    currentCardIndex = -1;
    lapseCount = 0;
    isNotInitialCard = false;
    document.getElementById("learningModeCb").disabled = true;
    document.getElementById("deck-list-section").style.display = "none";
    document.getElementById("card-list-section").style.display = "block";
    document.getElementById("selectedDeckName").textContent = deck.name;
    document.getElementById("selectedNextReview").textContent = `次の復習日: ${dateToShow(deck.nextReviewDate)}`;
    document.getElementById("selectedLastReview").textContent = `前の復習日: ${dateToShow(deck.lastReviewDate)}`;
    document.getElementById("cardFront").textContent = "ボタンで開始";
    if (getDaysBetweenDates(deck.nextReviewDate,getJapanTime()) >= 0) {
      document.getElementById("learningModeCb").disabled = false;
    }
    if (getDaysBetweenDates(deck.lastReviewDate,getJapanTime()) === 0) {
      document.getElementById("learningModeCb").disabled = true;
    }
    if (deck.lastReviewDate === null) {
      document.getElementById("learningModeCb").disabled = false;
    }
    try {
      currentCardList = await getAllCardsForDeck(selectedDeckId);
      await loadCardsForDeck(deckId);
    } catch (tryerror) {
      console.error("getAllCardsForDeck Failed", tryerror);
      throw tryerror;
    }
  }

  async function getAllCardsForDeck(deckId) {
    try {
      const store = await getCardStore("readonly");
      const index = store.index("deckId");
      console.log("getAllCardsForDeckSuccessed");
      const allCards = await promisifyRequest(index.getAll(IDBKeyRange.only(deckId)));
      if (selectedOrder === "random") {
        for (let i = allCards.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
        }
      }
      return await allCards
    } catch (e) {
      console.error("getAllCardsForDeckでエラー",e);
      throw e;
    }
  }

  async function loadCardsForDeck(deckId) {
    try {
      const store = await getCardStore("readonly");
      const index = store.index("deckId");
      const cards = await promisifyRequest(index.getAll(IDBKeyRange.only(deckId)));

      const cardList = document.getElementById("cardList");
      cardList.innerHTML = "";

      cards.forEach(card => {
        const li = document.createElement("li");
        const qSpan = document.createElement("span");
        qSpan.textContent = `Q: ${card.question}`;
        qSpan.id = "qspan";

        const aSpan = document.createElement("span");
        aSpan.textContent = `A: ${card.answer}`;
        aSpan.id = "aspan";

        const deleteBtn = createButton("削除", "red-btn", async () => {
          const confirmDelete = confirm(`「${card.question}」を削除してもよいですか？`);
          if (confirmDelete) {
            await deleteCards(card); // デッキに紐づくカードも削除
            await loadCardsForDeck(deckId); // カード一覧を再表示;
          }
        });
        deleteBtn.id = "cardListDeleteBtn";

        const cardCorrectAnswerRatio = document.createElement("span");
        cardCorrectAnswerRatio.id = "answerRatio"
        cardCorrectAnswerRatio.textContent = `正答率: ${card.correctAnswerRatio || 0}%`;

          // 両方をliに追加
        li.appendChild(qSpan);
        li.appendChild(aSpan);
        li.appendChild(deleteBtn);
        li.appendChild(cardCorrectAnswerRatio);

        cardList.appendChild(li);
      });
    } catch (e) {
      console.error("loadCardsForDeckでエラー",e);
      throw e;
    }
    console.log("loadCardsForDeck#Succeed")
  }
/////////////////////////

/////////////////////////
//  次のカード表示
  document.getElementById("correctBtn").addEventListener("click",
    async () => {
      if (isNotInitialCard === false) {goToNextCard(); return;}
      if (selectedMode === "learning") {goToNextCard(); return;}
      try {
        currentLapseList[currentCardIndex] = 2;
        const currentCard = currentCardList[currentCardIndex];
        console.log("correctBtn",currentCard,currentCardIndex);
        const store = await getCardStore();
        const card = await promisifyRequest(store.get(currentCard.id));
        card.totalAnswerCount = (card.totalAnswerCount || 0) + 1;
        card.correctCount = (card.correctCount || 0) + 1;
        card.correctAnswerRatio = Math.round(
          100 * (card.correctCount || 0) / (card.totalAnswerCount || 1)
        );
        await promisifyRequest(store.put(card));
        console.log("correctBtnイベント終了")
        await loadCardsForDeck(selectedDeckId);
      } catch (e) {
        console.error("correctBtnでエラー",e);
        throw e;
      }
      goToNextCard();
    }
  );

  document.getElementById("incorrectBtn").addEventListener("click",
    async () => {
      
      if (isNotInitialCard === false) {goToNextCard(); return;}
      if (selectedMode === "learning") {goToNextCard(); return;}
      try {
        lapseCount ++;
        currentLapseList[currentCardIndex] = 1;
        const currentCard = currentCardList[currentCardIndex];
        const store = await getCardStore();
        const card = await promisifyRequest(store.get(currentCard.id));
        card.totalAnswerCount = (card.totalAnswerCount || 0) + 1;
        card.incorrectCount = (card.incorrectCount || 0) + 1;
        card.correctAnswerRatio = Math.round(
          100 * (card.correctCount || 0) / (card.totalAnswerCount || 1)
        );
        await promisifyRequest(store.put(card));
        console.log("incorrectBtnイベント終了")
        await loadCardsForDeck(selectedDeckId);
      } catch (e) {
        console.error("incorrectBtnでエラー",e);
        throw e;
      }
      goToNextCard();
    }
  );

  function goToNextCard() {
    currentCardIndex++;
    if (currentCardIndex >= currentCardList.length) {
      currentCardIndex = -1;
      timeEnd();
      endFlashcard(); // 復習終了処理
      return;
    } 

    if (isNotInitialCard === false) {
      isNotInitialCard = !isNotInitialCard;
      timeStart();
    }

    console.log(`goto ${currentCardIndex} `);
    showingCardFront = true;
    if (selectedReverse === "reverse") {
      showingCardFront = false
    }
    renderFlashcard();
  }

  function renderFlashcard() {
    const flashcard = document.getElementById("cardFront");
    const currentCard = currentCardList[currentCardIndex];
    console.log(currentCard);
    if (currentCardList.length === 0) {
      flashcard.textContent = "カードがありません。"; 
      return;
    }
    flashcard.textContent = showingCardFront ? currentCard.question : currentCard.answer;
  }
/////////////////////////

/////////////////////////
//  最後のカード表示
  function calculateNextReviewDate(reviewCount, lapseCount) {
    const intervals = [0, 1, 2, 4, 8, 16, 32];
    
    // lapseCount が0なら reviewCount+1 のインデックスを使う（最大は配列の最後）
    let index = reviewCount;
    if (lapseCount === 0) {
      index = Math.min(reviewCount, intervals.length - 1);
    }

    const interval = intervals[index];

    const today = getJapanTime();
    const next = getJapanTime(today);
    next.setDate(today.getDate() + interval);

    return next;
  }

  function updateReviewCount(reviewCount, lapseCount, maxCount = 6) {
    if (lapseCount === 0) {
      return Math.min(reviewCount + 1, maxCount);
    } else {
      if (reviewCount === 0) {return reviewCount + 1;}
      return reviewCount;
    }
  }

  async function endCardsProcess() {
    try {
      const store = await getDeckStore();
      const deck = await promisifyRequest(store.get(selectedDeckId));
      deck.reviewCount = updateReviewCount(deck.reviewCount, lapseCount, 6);
      deck.nextReviewDate = calculateNextReviewDate(deck.reviewCount, lapseCount);
      deck.updatedDate = getJapanTime();
      deck.lastReviewDate = getJapanTime();
      await promisifyRequest(store.put(deck));
      console.log(`デッキ ${deck.name} の復習回数を更新しました: ${deck.reviewCount}`);
    } catch (e) {
      console.error("endCardsProcessでエラー",e);
      throw e;
    }
  }

  function repeat() {
    if (selectedRepeat === "allRepeat") {
      currentCardIndex = -1;
      showingCardFront = true;
      isNotInitialCard = false;
      document.getElementById("cardFront").textContent = "もう一周";
      renderFlashcard();
      return;
    };
    const flags = currentLapseList;
    const source = currentCardList;

    currentCardList = [];
    currentLapseList = [];

    for (let i = 0; i < flags.length; i++) {
      if (flags[i] === 1) {
        currentCardList.push(source[i]);
      }
    }

    console.log(currentCardList); // => ["b", "d"]
    currentCardIndex = -1;
    showingCardFront = true; // 表面を表示
    renderFlashcard();
  }

  async function endFlashcard() {
    if (selectedMode === "learning") {
      document.getElementById("cardFront").textContent = "ボタンで開始";
      isNotInitialCard = false;
      return;
    }

    try {
      if (currentLapseList.every(x => x === 2)) {
        document.getElementById("cardFront").textContent = "カードはすべて終了しました！";
        document.getElementById("correctBtn").disabled = true;
        document.getElementById("incorrectBtn").disabled = true;
        await endCardsProcess();
      } else {repeat();}
    } catch (e) {
      console.error("endCardsProcess Error",e);
      throw e;
    }
  }
/////////////////////////

/////////////////////////
//  カードの裏返し表示
  document.getElementById("cardFront").addEventListener("click", () => {
    if (isNotInitialCard === false) {return;}
    showingCardFront = !showingCardFront;
    renderFlashcard();
  });
/////////////////////////

/////////////////////////
//  decksectionへ戻る
  document.getElementById("backDeckForm").addEventListener("click", () => {
    // 表示をデッキ一覧に戻す
    currentdeckname = null; // 選択中のデッキ名をリセット
    currentCardList = []; // 現在のカードリストをリセット
    currentCardIndex = -1; // 現在のカードインデックスをリセット
    showingCardFront = true; // カードの表面を表示する
    document.getElementById("correctBtn").disabled = false;
    document.getElementById("incorrectBtn").disabled = false;
    document.getElementById("learningModeCb").checked = false;
    document.getElementById("deck-list-section").style.display = "block";
    document.getElementById("card-list-section").style.display = "none";
    selectedDeckId = null; // 選択中のデッキIDをリセット
    document.getElementById("selectedDeckName").textContent = ""; // 選択
    // 中のデッキ名をクリア
    document.getElementById("cardList").innerHTML = ""; // カードリスト
    renderDeckPage(currentPage); // デッキ一覧を再表示
  });
/////////////////////////

/////////////////////////
//  テストモード復習モードの切り替え
  document.getElementById("learningModeCb").addEventListener("change", async (event) => {
    try {
      const deckStore = await getDeckStore();
      const deck = await promisifyRequest(deckStore.get(selectedDeckId));
        if (event.target.checked) {
          console.log("テストモードが有効になりました");
          selectedMode = "testing"; // 繰り返し学習モードを有効化
          cardSectionInitialize(deck.id);
        }
        else {
          console.log("繰り返し学習モードが無効になりました");
          selectedMode = "learning"; // 通常のテストモードに戻す
          cardSectionInitialize(deck.id);
        }
    } catch (e) {
      console.error("learningModeCbでエラーキャッチ",e);
      throw e;
    }
  });
/////////////////////////

/////////////////////////
//  繰り返し出題モードの切り替え
  document.getElementById("strictedRepeatCb").addEventListener("change", async (event) => {
    try {
      const deckStore = await getDeckStore();
      const deck = await promisifyRequest(deckStore.get(selectedDeckId));
        if (event.target.checked) {
          console.log("繰り返し出題モードが出題減少になりました");
          selectedRepeat = "stricted"; // 繰り返し学習モードを有効化
          cardSectionInitialize(deck.id);
        }
        else {
          console.log("繰り返し出題モードが全出題になりました");
          selectedRepeat = "allRepeat"; // 通常のテストモードに戻す
          cardSectionInitialize(deck.id);
        }
    } catch (e) {
      console.error("strictedRepeatCbでエラーキャッチ",e);
      throw e;
    }
  });
/////////////////////////

/////////////////////////
//  繰り返し出題モードの切り替え
  async function randomCheck(event) {
    try {
      const deckStore = await getDeckStore();
      const deck = await promisifyRequest(deckStore.get(selectedDeckId));
        if (event.target.checked) {
          console.log("出題モードがランダムになりました");
          selectedOrder = "random"; // 繰り返し学習モードを有効化
          cardSectionInitialize(deck.id);
        }
        else {
          console.log("出題モードが順番になりました");
          selectedOrder = "number"; // 通常のテストモードに戻す
          cardSectionInitialize(deck.id);
        }
    } catch (e) {
      console.error("strictedRepeatCbでエラーキャッチ",e);
      throw e;
    }
  }

  async function reverseCheck(event) {
    try {
      const deckStore = await getDeckStore();
      const deck = await promisifyRequest(deckStore.get(selectedDeckId));
        if (event.target.checked) {
          console.log("出題モードが裏になりました");
          selectedReverse = "reverse"; // 繰り返し学習モードを有効化
          cardSectionInitialize(deck.id);
        }
        else {
          console.log("出題モードが表になりました");
          selectedReverse = "normal"; // 通常のテストモードに戻す
          cardSectionInitialize(deck.id);
        }
    } catch (e) {
      console.error("strictedRepeatCbでエラーキャッチ",e);
      throw e;
    }
  }
/////////////////////////

/////////////////////////
//  時間計測系
  function timeStart() {
    if (selectedMode === "learning") {return;}
    startClockTime = Date.now();
  };

  async function timeEnd() {
    if (selectedMode === "learning") {return;}
    const end = Date.now();
    const elapsedMs = end - startClockTime;
    console.log(`処理時間: ${elapsedMs} ミリ秒`);
    try {
      const store = await getDeckStore();
      const deck = await promisifyRequest(store.get(selectedDeckId));
      if (deck.maxTimeSecond < elapsedMs) {
        deck.maxTimeSecond = elapsedMs;
      } else {
        deck.currentTimeSecond = elapsedMs;
      };
      await promisifyRequest(store.put(deck));
    } catch (e) {
      console.error("timeEndでエラー", e);
      throw e;
    }
  };
/////////////////////////

/////////////////////////
//  カードリストの表示操作系
  document.getElementById("addCardBtn").addEventListener("click", async () => {
    const question = document.getElementById("questionInput").value.trim();
    const answer = document.getElementById("answerInput").value.trim();

    if (!question || !answer || selectedDeckId == null) {
      alert("表と裏を両方入力してください");
      return;
    }
    
    try {
      // デッキのカード数を更新
      const deckStore = await getDeckStore();
      const deck = await promisifyRequest(deckStore.get(selectedDeckId));
      deck.cardCount++;
      await promisifyRequest(deckStore.put(deck));

      const card = {
        deckId: selectedDeckId,
        question,
        answer,
        correctCount: 0, // 正解数
        incorrectCount: 0, // 不正解数
        totalAnswerCount: 0, // 合計回答数
        correctAnswerRatio: 0
      };

      const store = await getCardStore();
      await promisifyRequest(store.add(card));

      document.getElementById("questionInput").value = "";
      document.getElementById("answerInput").value = "";
      cardSectionInitialize(deck.id); 
    } catch (e) {
      console.error("addCardBtnのイベントエラー",e);
      throw e;
    }
  });

  async function deleteCards(card) {
    try {
      const store = await getCardStore();
      await promisifyRequest(store.delete(card.id));
      console.log(`カード ${card.id} を削除しました`);
    } catch (e) {
      console.error("deleteCardsでエラー",e);
      throw e;
    }
    
  }
/////////////////////////

//>|>|>|>|>|>|>|>|>|>|
//>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|>|
