const CARD_STORE = 'flashcards';
let db;
let showingFront = true;
let allDecks = []; // すべてのデッキ名
let deckPage = 0;

// セッション情報
let session = {
  deck: null,
  cards: [],
  queue: [],
  wrong: [],
  startTime: null,
  endTime: null,
  finished: false,
};

// IndexedDB 初期化
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('FlashcardDB', 1);
    request.onerror = () => reject('DB開けませんでした');
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };
    request.onupgradeneeded = e => {
      db = e.target.result;
      if (!db.objectStoreNames.contains(CARD_STORE)) {
        db.createObjectStore(CARD_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

const cardElem = document.getElementById('card');

// 復習間隔（エビングハウス的）
const intervals = [1, 2, 4, 8, 16, 32];

// カード情報更新
function updateCard(card) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CARD_STORE, 'readwrite');
    const store = tx.objectStore(CARD_STORE);
    const req = store.put(card);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// 日付加算ヘルパー
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function showCard() {
  if (session.queue && session.queue.length > 0) {
    showingFront = true;
    cardElem.textContent = session.queue[0].front;
  } else {
    cardElem.textContent = 'カードがありません';
  }
}

function deleteDeck(deckName) {
  return new Promise((resolve) => {
    const tx = db.transaction(CARD_STORE, 'readwrite');
    const store = tx.objectStore(CARD_STORE);
    const request = store.openCursor();
    request.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) {
        const card = cursor.value;
        if (card.deck === deckName) {
          store.delete(cursor.primaryKey);
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
  });
}

function showDeckReviewResult() {
  const endTime = Date.now();
  session.endTime = endTime;
  const elapsed = endTime - session.startTime;
  saveDeckSessionRecord(session.deck, elapsed);
  alert(`セッション完了！経過時間: ${(elapsed / 1000).toFixed(1)} 秒`);
}

function getCardsByDeck(deckName) {
  return new Promise((resolve) => {
    const tx = db.transaction(CARD_STORE, 'readonly');
    const store = tx.objectStore(CARD_STORE);
    const cards = [];
    store.openCursor().onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) {
        const card = cursor.value;
        if (card.deck === deckName) {
          cards.push(card);
        }
        cursor.continue();
      } else {
        resolve(cards);
      }
    };
  });
}

// 初期化
async function init() {
  await initDB();
  allDecks = await getAllDecks();
  if (allDecks.length > 0) {
    selectedDeck = allDecks[0];
    document.getElementById('selectedDeckName').textContent = selectedDeck;
    dueCards = await getCardsByDeck(selectedDeck); // ←修正
    currentIndex = 0;
    showCard();
  } else {
    document.getElementById('selectedDeckName').textContent = '（未選択）';
    dueCards = [];
    showCard();
  }
  renderCardList();
}

init();

// 新しい単語カードを追加
function addNewCard() {
  const front = document.getElementById('frontInput')?.value.trim();
  const back = document.getElementById('backInput')?.value.trim();
  const msg = document.getElementById('addMsg');

  if (!front || !back) {
    msg.style.color = 'red';
    msg.textContent = '表・裏の両方を入力してください';
    return;
  }
  if (!selectedDeck) {
    msg.style.color = 'red';
    msg.textContent = 'デッキを選択してください';
    return;
  }

  const newCard = {
  front,
  back,
  deck: selectedDeck,
  totalCount: 0,
  correctCount: 0,
  registrationDate: new Date().toISOString(),
  nextReviewDate: new Date().toISOString(),
  intervalIndex: 0,
  lastReviewed: null,
};


  const tx = db.transaction(CARD_STORE, 'readwrite');
  const store = tx.objectStore(CARD_STORE);
  const request = store.add(newCard);

  request.onsuccess = () => {
    msg.style.color = 'green';
    msg.textContent = '追加しました！ページを更新すると反映されます';
    document.getElementById('frontInput').value = '';
    document.getElementById('backInput').value = '';
    renderCardList();
  };

  request.onerror = () => {
    msg.style.color = 'red';
    msg.textContent = '追加に失敗しました。';
    console.error('カード追加失敗:', request.error);
  };
}


function renderCardList() {
  const listElem = document.getElementById('cardList');
  listElem.innerHTML = '';

  const tx = db.transaction(CARD_STORE, 'readonly');
  const store = tx.objectStore(CARD_STORE);

  store.openCursor().onsuccess = e => {
    const cursor = e.target.result;
    if (cursor) {
      const card = cursor.value;
      if (card.deck !== selectedDeck) {
        cursor.continue();
        return;
      }

      const div = document.createElement('div');
      div.className = 'card-item';

      const accuracy = card.totalCount
        ? Math.round((card.correctCount / card.totalCount) * 100)
        : '-';

      const text = document.createElement('span');
      text.innerHTML = `
        <span class="card-front">${card.front}</span> /
        <span class="card-back">${card.back}</span>
        <span style="margin-left: 10px; font-size: 0.9em; color: #666;">
          正解率: ${accuracy === '-' ? '-' : accuracy + '%'} 
          (${card.correctCount}/${card.totalCount})
        </span>
      `;

      const delBtn = document.createElement('button');
      delBtn.textContent = '削除';
      delBtn.className = 'delete-btn';
      delBtn.onclick = () => {
        deleteCard(card.id);
      };

      div.appendChild(text);
      div.appendChild(delBtn);
      listElem.appendChild(div);

      cursor.continue();
    }
  };
}



function deleteCard(id) {
  const tx = db.transaction(CARD_STORE, 'readwrite');
  const store = tx.objectStore(CARD_STORE);
  const request = store.delete(id);
  request.onsuccess = () => {
    renderCardList();
  };
}



// --- デッキ選択モーダル用 ---


const decksPerPage = 30;
let selectedDeck = "";

document.getElementById('deckSelectorBtn').addEventListener('click', () => {
  console.log("デッキ選択ボタンが押されました");
});

document.getElementById('deckSelectorBtn').addEventListener('click', async () => {
  allDecks = await getAllDecks(); // 例: IndexedDBからデッキ名一覧を取得
  deckPage = 0;
  showDeckModal();
});

function showDeckModal() {
  const modal = document.getElementById('deckModal');
  const deckList = document.getElementById('deckList');
  const pageInfo = document.getElementById('deckPageInfo');
  modal.style.display = 'block';

  // デッキごとに次の復習日を計算
  const deckInfoList = allDecks.map(deck => {
    return new Promise(resolve => {
      const tx = db.transaction(CARD_STORE, 'readonly');
      const store = tx.objectStore(CARD_STORE);
      let earliest = null;
      let regDate = null;
      store.openCursor().onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) {
          const card = cursor.value;
          if (card.deck === deck) {
            // 最初のカードの登録日を記録
            if (!regDate || new Date(card.registrationDate) < new Date(regDate)) {
              regDate = card.registrationDate;
            }
            // 最も早いnextReviewDateを記録
            if (!earliest || new Date(card.nextReviewDate) < new Date(earliest)) {
              earliest = card.nextReviewDate;
            }
          }
          cursor.continue();
        } else {
          resolve({ deck, regDate, earliest });
        }
      };
    });
  });

  Promise.all(deckInfoList).then(deckInfos => {
    // todayのデッキを先頭に
    const today = new Date();
    today.setHours(0,0,0,0);
    deckInfos.sort((a, b) => {
      const aNext = a.earliest ? new Date(a.earliest) : new Date(8640000000000000);
      const bNext = b.earliest ? new Date(b.earliest) : new Date(8640000000000000);
      const aIsToday = aNext <= today;
      const bIsToday = bNext <= today;
      if (aIsToday && !bIsToday) return -1;
      if (!aIsToday && bIsToday) return 1;
      return aNext - bNext;
    });

    // ページごとに表示
    const start = deckPage * decksPerPage;
    const decks = deckInfos.slice(start, start + decksPerPage);
    deckList.innerHTML = '';
    decks.forEach(info => {
      const div = document.createElement('div');
      div.style.padding = '8px 0';
      div.style.cursor = 'pointer';
      div.style.borderBottom = '1px solid #444';

      const nextText = '';
      const regText = info.regDate ? `（登録日: ${info.regDate.slice(0,10)}）` : '';

      // ★ここでデッキの最長・最新記録を取得
      const record = getDeckSessionRecord(info.deck);
      let recordText = '';
      if (record.longest && record.latest) {
        const percent = Math.round((1 - record.latest / record.longest) * 100);
        recordText = `最長: ${(record.longest/1000).toFixed(1)}秒 / 最新: ${(record.latest/1000).toFixed(1)}秒 (${percent}%短縮)`;
      }

      // ★完了判定
      let isToday = false;
      let isDone = false;
      if (info.earliest) {
        const nextDate = new Date(info.earliest);
        nextDate.setHours(0,0,0,0);
        const today = new Date();
        today.setHours(0,0,0,0);
        isToday = nextDate <= today;
        // デッキの復習日が今日以前で、かつデッキが復習済みなら完了
        if (isToday && selectedDeck !== info.deck) {
          isDone = true;
        }
      }

      let statusText = '';
      if (isToday) {
        if (selectedDeck === info.deck && session.finished) {
          statusText = `<span style="color:#fff;font-weight:bold;">完了</span>`;
        } else if (selectedDeck === info.deck && !session.finished) {
          statusText = `<span style="color:#fff;font-weight:bold;">進行中</span>`;
        } else {
          statusText = `<span style="color:#fff;font-weight:bold;">today</span>`;
        }
      }

      div.innerHTML = `<span>${info.deck}</span> ${regText} <span style="margin-left:10px;">${nextText} ${statusText}</span><br><span class="record-text">${recordText}</span>`;

      // 削除ボタンを追加
      const delBtn = document.createElement('button');
      delBtn.textContent = '削除';
      delBtn.className = 'delete-btn';
      delBtn.style.marginLeft = '16px';
      delBtn.onclick = async (e) => {
        e.stopPropagation(); // ダブルクリックイベントを発火させない
        if (confirm(`デッキ「${info.deck}」を本当に削除しますか？`)) {
          await deleteDeck(info.deck);
          allDecks = await getAllDecks();
          showDeckModal();
          renderCardList();
        }
      };
      div.appendChild(delBtn);

      // デッキ選択用ダブルクリックイベント（既存通り）
      if (isDeckDue(info.deck)) {
        div.style.background = '#2a4';
        div.ondblclick = async () => {
          selectedDeck = info.deck;
          document.getElementById('selectedDeckName').textContent = info.deck;
          modal.style.display = 'none';
          await startDeckReview(info.deck);
          renderCardList();
        };
      } else {
        div.style.opacity = 0.5;
        div.ondblclick = null;
        div.onclick = null;
      }
      deckList.appendChild(div);
    });
    pageInfo.textContent = `${deckPage + 1} / ${Math.ceil(deckInfos.length / decksPerPage)}`;
    document.getElementById('prevDeckPage').disabled = deckPage === 0;
    document.getElementById('nextDeckPage').disabled = (deckPage + 1) * decksPerPage >= deckInfos.length;
  });
}
document.getElementById('prevDeckPage').onclick = () => {
  if (deckPage > 0) {
    deckPage--;
    showDeckModal();
  }
};
document.getElementById('nextDeckPage').onclick = () => {
  if ((deckPage + 1) * decksPerPage < allDecks.length) {
    deckPage++;
    showDeckModal();
  }
};
document.getElementById('closeDeckModal').onclick = () => {
  document.getElementById('deckModal').style.display = 'none';
};

// 初期選択状態を表示
document.getElementById('selectedDeckName').textContent = selectedDeck || '（未選択）';

console.log("main.js loaded");

// すべてのデッキ名を取得
function getAllDecks() {
  return new Promise((resolve) => {
    const tx = db.transaction(CARD_STORE, 'readonly');
    const store = tx.objectStore(CARD_STORE);
    const decks = new Set();
    store.openCursor().onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) {
        const card = cursor.value;
        if (card.deck) {
          decks.add(card.deck);
        }
        cursor.continue();
      } else {
        resolve(Array.from(decks));
      }
    };
  });
}

document.getElementById('addDeckBtn').onclick = async () => {
  const input = document.getElementById('newDeckInput');
  const msg = document.getElementById('addDeckMsg');
  const name = input.value.trim();
  if (!name) {
    msg.style.color = 'red';
    msg.textContent = 'デッキ名を入力してください';
    return;
  }
  // 既存デッキと重複チェック
  allDecks = await getAllDecks();
  if (allDecks.includes(name)) {
    msg.style.color = 'red';
    msg.textContent = 'そのデッキ名は既に存在します';
    return;
  }
  // ダミーカードを追加してデッキを作る（カードが1枚もないとデッキ一覧に出ないため）
  const tx = db.transaction(CARD_STORE, 'readwrite');
  const store = tx.objectStore(CARD_STORE);
  const dummy = {
    front: '（ここにカードを追加してください）',
    back: '',
    deck: name,
    registrationDate: new Date().toISOString(),
    notificationCount: 0,
    nextReviewDate: new Date().toISOString(),
    lastReviewed: null,
    intervalIndex: 0,
    correctCount: 0
  };
  store.add(dummy);
  tx.oncomplete = async () => {
    msg.style.color = 'green';
    msg.textContent = 'デッキを追加しました';
    input.value = '';
    allDecks = await getAllDecks();
    showDeckModal(); // 追加後すぐ選択できるように
  };
};

async function startDeckSession(deckName) {
  session.deck = deckName;
  session.cards = await getCardsByDeck(deckName); // そのデッキの全カード
  session.queue = [...session.cards];
  session.wrong = [];
  session.startTime = Date.now();
  session.finished = false;
  showNextSessionCard();
}

let wrongCards = []; // セッションごとに間違えたカードを記録

function answerSessionCard(isCorrect) {
  const card = session.queue.shift(); // 先頭を取り出す
  if (!isCorrect) {
    // 間違えたカードは次の1問後に再出題
    session.queue.splice(1, 0, card);
    wrongCards.push(card.id);
  }
  if (session.queue.length === 0) {
    if (wrongCards.length === 0) {
      session.finished = true;
      showDeckReviewResult();
    } else {
      session.queue = [...session.cards];
      wrongCards = [];
      showCardForDeckReview();
    }
  } else {
    showCardForDeckReview();
  }
}

function saveDeckSessionRecord(deck, timeMs) {
  const key = `deckRecord_${deck}`;
  let record = JSON.parse(localStorage.getItem(key)) || { longest: 0, latest: 0 };
  if (timeMs > record.longest) record.longest = timeMs;
  record.latest = timeMs;
  localStorage.setItem(key, JSON.stringify(record));
}

function getDeckSessionRecord(deck) {
  const key = `deckRecord_${deck}`;
  return JSON.parse(localStorage.getItem(key)) || { longest: 0, latest: 0 };
}

function getDeckNextReviewDate(deck) {
  const key = `deckNextReview_${deck}`;
  return localStorage.getItem(key) || new Date().toISOString();
}

function setDeckNextReviewDate(deck, date) {
  const key = `deckNextReview_${deck}`;
  localStorage.setItem(key, date.toISOString());
}

function isDeckDue(deck) {
  const next = new Date(getDeckNextReviewDate(deck));
  const today = new Date();
  today.setHours(0,0,0,0);
  next.setHours(0,0,0,0);
  return next <= today;
}

async function startDeckReview(deckName) {
  session.deck = deckName;
  session.cards = await getCardsByDeck(deckName);
  session.queue = [...session.cards];
  session.startTime = Date.now();
  session.finished = false;
  currentIndex = 0;
  showCardForDeckReview();
}

function showCardForDeckReview() {
  if (session.queue.length === 0) {
    session.finished = true;
    setDeckNextReviewDate(session.deck, addDays(new Date(), 1));
    showDeckReviewResult();
    return;
  }
  showingFront = true;
  cardElem.textContent = session.queue[0].front;
  btnCorrect.disabled = false;
  btnWrong.disabled = false;
}


btnCorrect.onclick = async () => {
  const card = session.queue[0];
  if (!card) return; // ← 追加（nullチェック）

  card.totalCount = (card.totalCount || 0) + 1;
  card.correctCount = (card.correctCount || 0) + 1;
  await updateCard(card);
  answerSessionCard(true);
};

btnWrong.onclick = async () => {
  const card = session.queue[0];
  if (!card) return; // ← 追加（nullチェック）

  card.totalCount = (card.totalCount || 0) + 1;
  await updateCard(card);
  answerSessionCard(false);
};


cardElem.onclick = () => {
  if (!session.queue.length) return;
  showingFront = !showingFront;
  const card = session.queue[0];
  cardElem.textContent = showingFront ? card.front : card.back;
};







