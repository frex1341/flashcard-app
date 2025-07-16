// main.js
// フラッシュカードアプリのメインスクリプト
// IndexedDBを使ってデッキとカードのデータを管理
let db;
const DB_VERSION = 1; // IndexedDBのバージョン
const DB_NAME = "FlashcardDB"; // IndexedDBのデータベース名
const DECK_STORE = "decks"; // デッキのデータを保存するストア名
const CARD_STORE = "cards"; // カードのデータを保存するストア名
//デッキ管理用の変数
let selectedDeckId = null; // 選択中のデッキID
let selectedDeckName = null; // 選択中のデッキ名
let currentPage = 1;     // 現在のページ番号
const itemsPerPage = 10; // 1ページあたり何件表示するか
let sampleDecks = []; // サンプルデッキデータ
//カード管理用の変数
let showingCardFront = true; // カードが現在表かどうか
let currentCardList = []; // 現在のカードリスト
let currentCardIndex = 0; // 現在のカードのインデックス
let currentLapseList = [];
let lapseCount = 0;
let selectedMode = "testing"; // 選択中のモード（テスト、学習など）
let initialCard = true; // 初期カード表示フラグ
let reviewed = false;
let start = 0;
let repeatCard = false;

// 初期化処理
(async function() {
  try {
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

function initDB() { // IndexedDBの初期化
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
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
      db = event.target.result;
      resolve();
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

//デッキセクション
async function loadAllDecks() {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DECK_STORE, "readonly");
    const store = tx.objectStore(DECK_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const allData = request.result;
      allData.sort((a, b) => new Date(a.nextReviewDate) - new Date(b.nextReviewDate));
      resolve(allData);
    };

    request.onerror = () => reject(request.error);
  });
}

function showSampleDecks() { // サンプルデッキを表示する関数
  //例：サンプルのデッキデータ（実際はDBから読み込む）
  sampleDecks = [
    {id:1, name:"デッキ1", nextReviewDate:"2025-07-13"}, 
    {id:2, name:"デッキ2", nextReviewDate:"2025-07-12"},
    {id:3, name:"デッキ3", nextReviewDate:"2025-07-14"},
    {id:4, name:"デッキ4", nextReviewDate:"2025-07-11"},
    {id:5, name:"デッキ5", nextReviewDate:"2025-07-15"},
    {id:6, name:"デッキ6", nextReviewDate:"2025-07-10"},
    {id:7, name:"デッキ7", nextReviewDate:"2025-07-16"},
    {id:8, name:"デッキ8", nextReviewDate:"2025-07-09"},
    {id:9, name:"デッキ9", nextReviewDate:"2025-07-08"},
    {id:10, name:"デッキ10", nextReviewDate:"2025-07-17"},
    {id:11, name:"デッキ11", nextReviewDate:"2025-07-18"},
    {id:12, name:"デッキ12", nextReviewDate:"2025-07-19"},
    {id:13, name:"デッキ13", nextReviewDate:"2025-07-20"},
    {id:14, name:"デッキ14", nextReviewDate:"2025-07-21"},
    {id:15, name:"デッキ15", nextReviewDate:"2025-07-10"},
  ];

  const tx = db.transaction(DECK_STORE, "readwrite");
  const store = tx.objectStore(DECK_STORE);
  for (const deck of sampleDecks) {
    store.add(deck);
  }

  tx.oncomplete = () => {
    console.log("すべてのデッキを保存しました");
  };

  tx.onerror = (e) => {
    console.error("デッキの保存中にエラー", e.target.error);
  };
}

function deleteDeck(deckId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DECK_STORE, "readwrite");
    const store = tx.objectStore(DECK_STORE);
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
}

function deleteCardsForDeck(deckId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CARD_STORE, "readwrite");
    const store = tx.objectStore(CARD_STORE);
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
}

async function getSortedDecks() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DECK_STORE, "readonly");
    const store = tx.objectStore(DECK_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const allDecks = request.result;
      allDecks.sort((a, b) => new Date(a.nextReviewDate) - new Date(b.nextReviewDate));
      resolve(allDecks);
    };

    request.onerror = () => {
      console.error("デッキの取得に失敗しました", request.error);
      reject(request.error);
    };
  });
}

function paginateDecks(allDecks, page, itemsPerPage) {
  const start = (page - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  return allDecks.slice(start, end);
}

function renderDeckList(decks) {
  const deckList = document.getElementById("deckList");
  deckList.innerHTML = "";
  

  decks.forEach(deck => {
    const li = document.createElement("li");

    const span = document.createElement("span");
    const daysLeft = Math.ceil((new Date(deck.nextReviewDate) - new Date()) / (1000 * 60 * 60 * 24));
    span.textContent = `📘 ${deck.name}（あと ${daysLeft} 日）`;
    span.style.marginRight = "10px";
    span.addEventListener("click", () => {
      selectedDeckName = deck.name;
      showCardsForDeck(deck.id, deck.name);
    });

    const detailBtn = document.createElement("button");
    detailBtn.textContent = "詳細";
    detailBtn.style.marginRight = "30px";
    detailBtn.classList.add("blue-btn");
    detailBtn.addEventListener("click", () => {
      showCardsForDeck(deck.id, deck.name);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "削除";
    deleteBtn.classList.add("red-btn");
    deleteBtn.addEventListener("click", async () => {
      const confirmDelete = confirm(`「${deck.name}」を削除してもよいですか？`);
      if (confirmDelete) {
        await deleteDeck(deck.id);
        await deleteCardsForDeck(deck.id);
        await loadAllDecks().then(() => renderDeckPage(1));
      }
    });

    li.appendChild(span);
    li.appendChild(detailBtn);
    li.appendChild(deleteBtn);

    deckList.appendChild(li);
  });
}

async function renderDeckPage(page) {
  currentPage = page;
  try {
    const allDecks = await getSortedDecks();
    const decksToShow = paginateDecks(allDecks, page, itemsPerPage);
    renderDeckList(decksToShow);
    document.getElementById("currentPage").textContent = `ページ ${page}`;
  } catch (error) {
    console.error("デッキ表示でエラーが発生しました", error);
  }
}

document.getElementById("prevPageBtn").addEventListener("click", () => {
  if (currentPage > 1) {
    renderDeckPage(currentPage - 1);
  }
});

document.getElementById("nextPageBtn").addEventListener("click", () => {
  const tx = db.transaction(DECK_STORE, "readonly");
  const store = tx.objectStore(DECK_STORE);
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
});

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
    createdDate: new Date().toISOString().split('T')[0],
    updatedDate: new Date().toISOString().split('T')[0],
    nextReviewDate: new Date().toISOString().split('T')[0] // 今日の日付を設定
  };

  const tx = db.transaction(DECK_STORE, "readwrite");
  const store = tx.objectStore(DECK_STORE);
  store.add(deck);

  tx.oncomplete = () => {
    document.getElementById("deckNameInput").value = "";
    loadAllDecks().then(() => renderDeckPage(1)); // デッキ一覧を再読み込み
  };
});

//カードセクション
document.getElementById("correctBtn").addEventListener("click", goToNextCard);
document.getElementById("incorrectBtn").addEventListener("click", goToNextCard);

document.getElementById("learningModeCheckbox").addEventListener("change", (event) => {
  if (event.target.checked) {
    console.log("繰り返し学習モードが有効になりました");
    selectedMode = "learning"; // 繰り返し学習モードを有効化
    showFlashcards(currentCardList);
  }
  else {
    console.log("繰り返し学習モードが無効になりました");
    selectedMode = "testing"; // 通常のテストモードに戻す
    showFlashcards(currentCardList);
  }
});

function showCardsForDeck(deckId, deckName) {
  reviewed = false;
  selectedDeckId = deckId;
  document.getElementById("correctBtn").disabled = false;
  document.getElementById("incorrectBtn").disabled = false;
  const tx = db.transaction(DECK_STORE, "readwrite");
  const store = tx.objectStore(DECK_STORE);
  const deckRequest = store.get(selectedDeckId);
  deckRequest.onsuccess = () => {
    const deck = deckRequest.result;
    if (deck.lastReviewDate === new Date().toISOString().split('T')[0]) {
      document.getElementById("correctBtn").disabled = true;
      document.getElementById("incorrectBtn").disabled = true;
      document.getElementById("cardFront").textContent = "終了済み";
      console.log("pass");
      reviewed = true;
      return;
    }
  }
  deckRequest.onerror = () => {
    console.log("failure")
  }
  // 表示切り替え
  document.getElementById("deck-list-section").style.display = "none";
  document.getElementById("card-list-section").style.display = "block";

  // 選択中のデッキ名を表示
  document.getElementById("selectedDeckName").textContent = deckName;

  // そのデッキに対応するカードを読み込み表示
  loadCardsForDeck(deckId);
}

function loadCardsForDeck(deckId) {
  const tx = db.transaction(CARD_STORE, "readonly");
  const store = tx.objectStore(CARD_STORE);
  const index = store.index("deckId");
  const request = index.getAll(IDBKeyRange.only(deckId));

  request.onsuccess = () => {
    const cards = request.result;
    const cardList = document.getElementById("cardList");
    cardList.innerHTML = "";

    if (cards.length === 0) {
      renderFlashcard(); // カードがない場合はフラッシュカードをリセット
      return;
    }

    cards.forEach(card => {
      const li = document.createElement("li");
      const qSpan = document.createElement("span");
      qSpan.textContent = `Q: ${card.question}`;
      qSpan.style.color = "lightcoral";  // ← ここで赤色指定
      qSpan.id = "qspan"

      const aSpan = document.createElement("span");
      aSpan.textContent = `A: ${card.answer}`;
      aSpan.id = "aspan"

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "削除";
      deleteBtn.classList.add("red-btn2");
      deleteBtn.addEventListener("click", async () => {
        const confirmDelete = confirm(`「${card.question}」を削除してもよいですか？`);
        if (confirmDelete) {
          await deleteCards(card); // デッキに紐づくカードも削除
          loadCardsForDeck(deckId, selectedDeckName); // カード一覧を再表示
        }
      });

      const cardCorrectAnswerRatio = document.createElement("span");
      cardCorrectAnswerRatio.id = "answerRatio"
      cardCorrectAnswerRatio.textContent = `正答率: ${card.correctAnswerRatio || 0}%`;
      cardCorrectAnswerRatio.classList.add("cardCorrectAnswerRatio");


      // 両方をliに追加
      li.appendChild(qSpan);
      li.appendChild(aSpan);
      li.appendChild(deleteBtn);
      li.appendChild(cardCorrectAnswerRatio);

      cardList.appendChild(li);
      showFlashcards(cards); // カードを表示
    });
  };

  request.onerror = () => {
    console.error("カード読み込み失敗", request.error);
  };
}

function showFlashcards(cards) {
  currentCardList = cards;
  initialCard = true;
  currentCardIndex = 0;
  showingCardFront = true;
  lapseCount = 0;

  renderFlashcard();
}

function repeat() {
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
  currentCardIndex = 0;
  renderFlashcard();
}

function reloadCardList() {
  const tx = db.transaction(CARD_STORE, "readonly");
  const store = tx.objectStore(CARD_STORE);
  const index = store.index("deckId");
  const request = index.getAll(IDBKeyRange.only(selectedDeckId));

  request.onsuccess = () => {
    const cards = request.result;
    const cardList = document.getElementById("cardList");
    cardList.innerHTML = "";

    if (cards.length === 0) {
      renderFlashcard(); // カードがない場合はフラッシュカードをリセット
      return;
    }

    cards.forEach(card => {
      const li = document.createElement("li");
      const qSpan = document.createElement("span");
      qSpan.textContent = `Q: ${card.question}`;
      qSpan.style.color = "lightcoral";  // ← ここで赤色指定
      qSpan.id = "qspan"

      const aSpan = document.createElement("span");
      aSpan.textContent = `A: ${card.answer}`;
      aSpan.id = "aspan"

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "削除";
      deleteBtn.classList.add("red-btn2");
      deleteBtn.addEventListener("click", async () => {
        const confirmDelete = confirm(`「${card.question}」を削除してもよいですか？`);
        if (confirmDelete) {
          await deleteCards(card); // デッキに紐づくカードも削除
          loadCardsForDeck(deckId, selectedDeckName); // カード一覧を再表示
        }
      });

      const cardCorrectAnswerRatio = document.createElement("span");
      cardCorrectAnswerRatio.id = "answerRatio"
      cardCorrectAnswerRatio.textContent = `正答率: ${card.correctAnswerRatio || 0}%`;
      cardCorrectAnswerRatio.classList.add("cardCorrectAnswerRatio");


      // 両方をliに追加
      li.appendChild(qSpan);
      li.appendChild(aSpan);
      li.appendChild(deleteBtn);
      li.appendChild(cardCorrectAnswerRatio);

      cardList.appendChild(li);
    });
  };

  request.onerror = () => {
    console.error("カード読み込み失敗", request.error);
  };
}

function renderFlashcard() {
  console.log(currentCardIndex);
  const flashcard = document.getElementById("cardFront");
  const currentCard = currentCardList[currentCardIndex];
  if(reviewed) {
    flashcard.textContent = "終了済み";
    return;
  }
  if (initialCard) {
    flashcard.textContent = "カードをクリックして表面を表示";
    return;
  }
  if (repeatCard) {
    flashcard.textContent = "カードをクリックして表面を表示";
    return;
  }
  if (currentCardList.length === 0) {
    flashcard.textContent = "カードがありません。"; 
    return;
  }
  if (currentCardIndex >= currentCardList.length) {
    if (selectedMode === "learning") {
      currentCardIndex = 0; // 学習モードでは最初のカードに戻る
      showingCardFront = true; // 表面を表示
      return renderFlashcard();
    } else {
    endFlashcard(); // 復習終了処理
    return;
    }
  }
  console.log("a " + currentCard);
  flashcard.textContent = showingCardFront ? currentCard.question : currentCard.answer;
  return;
}

function calculateNextReviewDate(reviewCount, lapseCount) {
  const intervals = [1, 2, 4, 8, 16, 32];
  
  // lapseCount が0なら reviewCount+1 のインデックスを使う（最大は配列の最後）
  let index = reviewCount;
  if (lapseCount === 0) {
    index = Math.min(reviewCount, intervals.length - 1);
  }

  const interval = intervals[index];

  const today = new Date();
  const next = new Date(today);
  next.setDate(today.getDate() + interval);

  return next.toISOString().split('T')[0];
}

function updateReviewCount(reviewCount, lapseCount, maxCount = 5) {
  if (lapseCount === 0) {
    return Math.min(reviewCount + 1, maxCount);
  } else {
    return reviewCount;
  }
}

function endFlashcard() {
  console.log("Before check", [...currentLapseList]); // スプレッドでコピー表示
  if (currentLapseList.every(x => x === 2)) {
    timeEnd();
    document.getElementById("cardFront").textContent = "カードはすべて終了しました！";
    console.log(selectedDeckName, "のカードはすべて終了しました");
    console.log(currentLapseList);
    const tx = db.transaction(DECK_STORE, "readwrite");
    const store = tx.objectStore(DECK_STORE);
    const deckRequest = store.get(selectedDeckId);
      deckRequest.onsuccess = () => {
        const deck = deckRequest.result;
        deck.reviewCount = updateReviewCount(deck.reviewCount, lapseCount, 5);
        deck.nextReviewDate = calculateNextReviewDate(deck.reviewCount, lapseCount);
        deck.updatedDate = new Date().toISOString().split('T')[0];
        deck.lastReviewDate = new Date().toISOString().split('T')[0];
        store.put(deck);
        console.log(`デッキ ${deck.name} の復習回数を更新しました: ${deck.reviewCount}`);
        document.getElementById("correctBtn").disabled = true;
        document.getElementById("incorrectBtn").disabled = true;
      };
      deckRequest.onerror = () => {
        console.error("デッキの復習回数更新に失敗", tx.error);
      };
  } else {
    repeatCard = true;
    repeat();
  };
};

document.getElementById("backDeckForm").addEventListener("click", () => {
  // 表示をデッキ一覧に戻す
  currentdeckname = null; // 選択中のデッキ名をリセット
  currentCardList = []; // 現在のカードリストをリセット
  currentCardIndex = 0; // 現在のカードインデックスをリセット
  showingCardFront = true; // カードの表面を表示する
  document.getElementById("deck-list-section").style.display = "block";
  document.getElementById("card-list-section").style.display = "none";
  selectedDeckId = null; // 選択中のデッキIDをリセット
  document.getElementById("selectedDeckName").textContent = ""; // 選択
  // 中のデッキ名をクリア
  document.getElementById("cardList").innerHTML = ""; // カードリスト
  renderDeckPage(currentPage); // デッキ一覧を再表示
});

document.getElementById("cardFront").addEventListener("click", () => {
  showingCardFront = !showingCardFront;
  renderFlashcard();
});

function goToCardProperty(actionBtn) {
  const currentCard = currentCardList[currentCardIndex];
  const tx = db.transaction(CARD_STORE, "readwrite");
  const store = tx.objectStore(CARD_STORE);
  const request = store.get(currentCard.id);

  request.onsuccess = () => {
    const card = request.result;
    if (!card) {
      console.error("カードが見つかりません");
      return;
    }

    if (actionBtn === "incorrectBtn") {
      console.log(`incorrectx= ${currentCardIndex}`);
      currentLapseList[currentCardIndex] = 1;
      card.totalAnswerCount = (card.totalAnswerCount || 0) + 1;
      card.incorrectCount = (card.incorrectCount || 0) + 1;
    } else {
      console.log(`correctx= ${currentCardIndex}`);
      currentLapseList[currentCardIndex] = 2;
      card.totalAnswerCount = (card.totalAnswerCount || 0) + 1;
      card.correctCount = (card.correctCount || 0) + 1;
    }

    card.correctAnswerRatio = Math.round(
      100 * (card.correctCount || 0) / (card.totalAnswerCount || 1)
    );

    store.put(card);
    reloadCardList();

    currentCardIndex++;
    showingCardFront = true;
    renderFlashcard();
  };

  request.onerror = () => {
    console.error(`${actionBtn === "incorrectBtn" ? "incorrect" : "correct"}.error`);
  };
}

function goToNextCard(event) {
  const actionBtn = event.target.id;
  if (actionBtn === "incorrectBtn") {
  console.log("クリックした要素:", event.target.id);
  lapseCount ++;
  console.log(lapseCount);
  };
  if (initialCard == true) {
  initialCard = !initialCard; // 初期カード表示フラグをオフ
  currentCardIndex = 0;
  console.log(currentCardList);
  timeStart();
  renderFlashcard();
  return;
  };
  if (repeatCard) {
  repeatCard = !repeatCard;
  currentCardIndex = 0;
  renderFlashcard();
  return;
  };
  console.log(`goto ${currentCardIndex} `)
  goToCardProperty(actionBtn);
};

document.getElementById("addCardBtn").addEventListener("click", async () => {
  const question = document.getElementById("questionInput").value.trim();
  const answer = document.getElementById("answerInput").value.trim();

  if (!question || !answer || selectedDeckId == null) {
    alert("表と裏を両方入力してください");
    return;
  }
  
  // デッキのカード数を更新
  const deckTx = db.transaction(DECK_STORE, "readwrite");
  const deckStore = deckTx.objectStore(DECK_STORE);
  const deckRequest = deckStore.get(selectedDeckId);
  deckRequest.onsuccess = () => {
    const deck = deckRequest.result;
    deck.cardCount++;
    deckStore.put(deck);
    console.log(`デッキ ${deck.name} のカード数を更新しました: ${deck.cardCount}`);
  };
  deckTx.onerror = () => {
    console.error("デッキのカード数更新に失敗", deckTx.error);
    return;
  };

  const card = {
    deckId: selectedDeckId,
    cardId: Date.now(), // 一意のIDを生成
    question,
    answer,
    correctCount: 0, // 正解数
    incorrectCount: 0, // 不正解数
    totalAnswerCount: 0, // 合計回答数
    correctAnswerRatio: 0
  };

  const tx = db.transaction(CARD_STORE, "readwrite");
  const store = tx.objectStore(CARD_STORE);
  store.add(card);

  tx.oncomplete = () => {
    document.getElementById("questionInput").value = "";
    document.getElementById("answerInput").value = "";
    loadCardsForDeck(selectedDeckId); // 再表示
  };
});

async function deleteCards(card) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CARD_STORE, "readwrite");
    const store = tx.objectStore(CARD_STORE);
    const request = store.delete(card.id);
    request.onsuccess = () => {
      console.log(`カード ${card.id} を削除しました`);
      resolve();
    };
    request.onerror = () => {
      console.error(`カード ${card.id} の削除に失敗しました`, request.error,
      reject(request.error));
    };
  });
}

function timeStart() {
  start = Date.now();
};

function timeEnd() {
  const end = Date.now();
  const elapsedMs = end - start;
  console.log(`処理時間: ${elapsedMs} ミリ秒`);
  const tx = db.transaction(DECK_STORE, "readwrite");
  const store = tx.objectStore(DECK_STORE);
  const deckRequest = store.get(selectedDeckId);
  deckRequest.onsuccess = () => {
    const deck = deckRequest.result;
    console.log(deck);
    if (deck.maxTimeSecond < elapsedMs) {
      deck.maxTimeSecond = elapsedMs;
    } else {
      deck.currentTimeSecond = elapsedMs;
    };
    store.put(deck);
  };
};