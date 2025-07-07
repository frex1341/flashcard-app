const CARD_STORE = 'flashcards';
let db;
let currentCard = null;
let showingFront = true;

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

// サンプルカードをDBに入れる（初回だけ）
function addSampleCards() {
  return new Promise((resolve) => {
    const tx = db.transaction(CARD_STORE, 'readwrite');
    const store = tx.objectStore(CARD_STORE);

    const sampleCards = [
      {
        front: 'apple',
        back: 'りんご',
        registrationDate: new Date().toISOString(),
        notificationCount: 0,
        nextReviewDate: new Date().toISOString(),
        lastReviewed: null,
        intervalIndex: 0
      },
      {
        front: 'banana',
        back: 'バナナ',
        registrationDate: new Date().toISOString(),
        notificationCount: 0,
        nextReviewDate: new Date().toISOString(),
        lastReviewed: null,
        intervalIndex: 0
      }
    ];

    sampleCards.forEach(card => store.add(card));
    tx.oncomplete = () => resolve();
  });
}

// 今日復習すべきカードを取得
function getDueCards() {
  return new Promise((resolve) => {
    const tx = db.transaction(CARD_STORE, 'readonly');
    const store = tx.objectStore(CARD_STORE);
    const cards = [];
    const today = new Date();
    today.setHours(0,0,0,0);

    store.openCursor().onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) {
        const card = cursor.value;
        const nextReview = new Date(card.nextReviewDate);
        nextReview.setHours(0,0,0,0);
        if (nextReview <= today) cards.push(card);
        cursor.continue();
      } else {
        resolve(cards);
      }
    };
  });
}

const cardElem = document.getElementById('card');
const btnCorrect = document.getElementById('btnCorrect');
const btnWrong = document.getElementById('btnWrong');

let dueCards = [];
let currentIndex = 0;

// カード表示更新
function showCard() {
  if (!dueCards.length) {
    cardElem.textContent = 'お疲れ様！今日の復習はありません。';
    btnCorrect.disabled = true;
    btnWrong.disabled = true;
    return;
  }
  currentCard = dueCards[currentIndex];
  showingFront = true;
  cardElem.textContent = currentCard.front;
  btnCorrect.disabled = false;
  btnWrong.disabled = false;
}

// カード裏返す
cardElem.addEventListener('click', () => {
  if (!currentCard) return;
  showingFront = !showingFront;
  cardElem.textContent = showingFront ? currentCard.front : currentCard.back;
});

// 復習間隔（エビングハウス的）
const intervals = [1, 2, 4, 8, 16, 32];

// 正解処理
async function handleCorrect() {
  currentCard.notificationCount++;
  currentCard.intervalIndex = Math.min(currentCard.intervalIndex + 1, intervals.length - 1);
  const nextDays = intervals[currentCard.intervalIndex];
  currentCard.nextReviewDate = addDays(new Date(), nextDays).toISOString();
  currentCard.lastReviewed = new Date().toISOString();
  await updateCard(currentCard);
  nextCard();
  currentCard.correctCount = (currentCard.correctCount || 0) + 1;
}

// 不正解処理
async function handleWrong() {
  // 次の復習は今の間隔をキープ
  const nextDays = intervals[currentCard.intervalIndex];
  currentCard.nextReviewDate = addDays(new Date(), nextDays).toISOString();
  currentCard.lastReviewed = new Date().toISOString();
  await updateCard(currentCard);
  nextCard();
}

// カード情報更新
function updateCard(card) {
  return new Promise((resolve) => {
    const tx = db.transaction(CARD_STORE, 'readwrite');
    const store = tx.objectStore(CARD_STORE);
    const request = store.put(card);
    request.onsuccess = () => resolve();
  });
}

// 次のカードへ
function nextCard() {
  currentIndex++;
  if (currentIndex >= dueCards.length) {
    cardElem.textContent = 'お疲れ様！今日の復習はありません。';
    btnCorrect.disabled = true;
    btnWrong.disabled = true;
    return;
  }
  showCard();
}

// 日付加算ヘルパー
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// 初期化
async function init() {
  await initDB();

  // DBにカードがあるかチェック
  const tx = db.transaction(CARD_STORE, 'readonly');
  const store = tx.objectStore(CARD_STORE);
  const countRequest = store.count();

  countRequest.onsuccess = async () => {
    // サンプルカードを追加しない
    dueCards = await getDueCards();
    currentIndex = 0;
    showCard();
  };
  renderCardList();
}

btnCorrect.addEventListener('click', handleCorrect);
btnWrong.addEventListener('click', handleWrong);

init();

// 新しい単語カードを追加
function addNewCard() {
  const front = document.getElementById('frontInput').value.trim();
  const back = document.getElementById('backInput').value.trim();
  const msg = document.getElementById('addMsg');

  if (!front || !back) {
    msg.style.color = 'red';
    msg.textContent = '表と裏の両方を入力してください';
    return;
  }

  const newCard = {
    front,
    back,
    registrationDate: new Date().toISOString(),
    notificationCount: 0,
    nextReviewDate: new Date().toISOString(),
    lastReviewed: null,
    intervalIndex: 0,
    correctCount: 0 
  };

  const tx = db.transaction(CARD_STORE, 'readwrite');
  const store = tx.objectStore(CARD_STORE);
  const request = store.add(newCard);

  request.onsuccess = () => {
    msg.style.color = 'green';
    msg.textContent = '追加しました！ページを更新すると反映されます';
    document.getElementById('frontInput').value = '';
    document.getElementById('backInput').value = '';
  };
  renderCardList();
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

      // 初期化されてない古いカードに対応
      card.correctCount = card.correctCount || 0;
      card.notificationCount = card.notificationCount || 0;

      const div = document.createElement('div');
      div.className = 'card-item';

      const accuracy = card.notificationCount
        ? Math.round((card.correctCount / card.notificationCount) * 100)
        : '-';

      const text = document.createElement('span');
      text.innerHTML = `
        <span class="card-front">${card.front}</span> /
        <span class="card-back">${card.back}</span>
        <span style="margin-left: 10px; font-size: 0.9em; color: #666;">
          正解率: ${accuracy === '-' ? '-' : accuracy + '%'} 
          (${card.correctCount}/${card.notificationCount})
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
    // もし現在表示中のカードが削除されたら、再取得
    dueCards = dueCards.filter(c => c.id !== id);
    if (currentCard && currentCard.id === id) {
      nextCard();
    }
  };
}
