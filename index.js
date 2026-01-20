
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  writeBatch, 
  getDocs 
} from "firebase/firestore";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCkaXacwulV6PDl9kPeXJH9Tc4mnz4gzJI",
  authDomain: "vibe-coding-survey-3a8f8.firebaseapp.com",
  projectId: "vibe-coding-survey-3a8f8",
  storageBucket: "vibe-coding-survey-3a8f8.firebasestorage.app",
  messagingSenderId: "658964945091",
  appId: "1:658964945091:web:ef527eacd767c92de62a76",
  measurementId: "G-R4FYC0FL90"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// State
let currentState = {
  helpful: 3, 
  understanding: 3, 
  comments: '',
  allFeedbacks: []
};

// Initialize App
function init() {
  bindFirestore();
  setupEventListeners();
}

// Real-time synchronization with Firestore
function bindFirestore() {
  const feedbackRef = collection(db, "feedback");
  const q = query(feedbackRef, orderBy("timestamp", "desc"));
  
  onSnapshot(q, (snapshot) => {
    currentState.allFeedbacks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Update Admin view if it's currently visible
    if (views.admin.classList.contains('active')) {
      renderAdmin();
    }
  });
}

// UI Elements
const views = {
  survey: document.getElementById('view-survey'),
  thanks: document.getElementById('view-thanks'),
  admin: document.getElementById('view-admin')
};

function switchView(viewId) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[viewId].classList.add('active');
  window.scrollTo(0, 0);
  
  if (viewId === 'admin') renderAdmin();
}

function setupEventListeners() {
  // Range Sliders
  const helpfulSlider = document.getElementById('helpful-slider');
  const helpfulDisplay = document.getElementById('helpful-val-display');
  helpfulSlider.oninput = (e) => {
    currentState.helpful = parseInt(e.target.value);
    helpfulDisplay.textContent = e.target.value;
  };

  const understandingSlider = document.getElementById('understanding-slider');
  const understandingDisplay = document.getElementById('understanding-val-display');
  understandingSlider.oninput = (e) => {
    currentState.understanding = parseInt(e.target.value);
    understandingDisplay.textContent = e.target.value;
  };

  // Navigation & Actions
  document.getElementById('submit-btn').onclick = submitFeedback;
  document.getElementById('go-admin-btn').onclick = () => switchView('admin');
  document.getElementById('thanks-admin-btn').onclick = () => switchView('admin');
  document.getElementById('restart-btn').onclick = resetForm;
  document.getElementById('back-survey-btn').onclick = () => switchView('survey');
  document.getElementById('run-ai-btn').onclick = runAiAnalysis;
  document.getElementById('clear-data-btn').onclick = clearAllData;
}

function resetForm() {
  currentState.helpful = 3;
  currentState.understanding = 3;
  currentState.comments = '';
  
  document.getElementById('comments').value = '';
  document.getElementById('helpful-slider').value = 3;
  document.getElementById('understanding-slider').value = 3;
  document.getElementById('helpful-val-display').textContent = 3;
  document.getElementById('understanding-val-display').textContent = 3;
  
  switchView('survey');
}

async function submitFeedback() {
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = '제출 중...';

  try {
    const feedbackData = {
      timestamp: Date.now(),
      helpful: currentState.helpful,
      understanding: currentState.understanding,
      comments: document.getElementById('comments').value.trim()
    };

    await addDoc(collection(db, "feedback"), feedbackData);
    switchView('thanks');
  } catch (err) {
    console.error("Error adding document: ", err);
    alert("제출 중 오류가 발생했습니다. 다시 시도해 주세요.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '제출하기';
  }
}

function renderAdmin() {
  const feedbacks = currentState.allFeedbacks;
  const count = feedbacks.length;
  document.getElementById('response-count').textContent = `총 ${count}개의 응답이 수집되었습니다.`;

  if (count > 0) {
    const sumH = feedbacks.reduce((acc, f) => acc + (f.helpful || 0), 0);
    const sumU = feedbacks.reduce((acc, f) => acc + (f.understanding || 0), 0);
    document.getElementById('avg-helpful').textContent = (sumH / count).toFixed(1);
    document.getElementById('avg-understanding').textContent = (sumU / count).toFixed(1);
    document.getElementById('run-ai-btn').disabled = false;
  } else {
    document.getElementById('avg-helpful').textContent = '0.0';
    document.getElementById('avg-understanding').textContent = '0.0';
    document.getElementById('run-ai-btn').disabled = true;
  }

  const listContainer = document.getElementById('feedback-list');
  listContainer.innerHTML = '';
  
  if (count === 0) {
    listContainer.innerHTML = '<p class="text-center py-10 notion-text-gray italic">아직 수집된 응답이 없습니다.</p>';
  } else {
    feedbacks.forEach(f => {
      const card = document.createElement('div');
      card.className = 'border notion-border rounded-xl p-5 hover:bg-gray-50 transition-colors shadow-sm';
      card.innerHTML = `
        <div class="flex justify-between items-start mb-3">
          <span class="text-[11px] text-[#acaba9] font-medium uppercase tracking-tighter">${new Date(f.timestamp).toLocaleString()}</span>
          <div class="flex gap-1.5">
            <span class="notion-bg-light px-2 py-0.5 rounded text-[10px] font-bold text-[#37352f]">도움 ${f.helpful}</span>
            <span class="notion-bg-light px-2 py-0.5 rounded text-[10px] font-bold text-[#37352f]">이해 ${f.understanding}</span>
          </div>
        </div>
        <p class="text-sm leading-relaxed">${f.comments || '<span class="text-[#acaba9] italic">의견 없음</span>'}</p>
      `;
      listContainer.appendChild(card);
    });
  }
}

async function runAiAnalysis() {
  if (currentState.allFeedbacks.length === 0) return;

  const contentArea = document.getElementById('analysis-content');
  const originalHtml = contentArea.innerHTML;
  contentArea.innerHTML = `
    <div class="flex items-center justify-center py-10 notion-text-gray">
      <div class="animate-spin mr-3">🌀</div>
      데이터를 분석하는 중입니다...
    </div>
  `;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const summary = currentState.allFeedbacks.map(f => 
      `평점(도움): ${f.helpful}/5, 평점(이해): ${f.understanding}/5, 의견: ${f.comments || '없음'}`
    ).join('\n');

    const prompt = `
      강연 주제: '바이브 코딩(Vibe Coding)'
      대상: 대학생
      
      아래의 강의 평가 데이터를 분석하여 강연자에게 전달할 핵심 통찰을 노션 스타일로 깔끔하게 정리해 줘.
      강의의 강점, 약점, 그리고 다음 강의를 위한 구체적인 제언을 포함해 줘. 
      친절하면서도 전문적인 어조의 한국어로 작성해 줘.

      데이터:
      ${summary}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt
    });

    contentArea.innerHTML = `<div class="prose prose-sm max-w-none text-sm leading-relaxed">${response.text}</div>`;
  } catch (err) {
    console.error(err);
    contentArea.innerHTML = `<p class="text-red-500 text-sm py-4">분석 중 오류가 발생했습니다: ${err.message}</p>`;
    setTimeout(() => contentArea.innerHTML = originalHtml, 4000);
  }
}

async function clearAllData() {
  if (confirm('정말로 Firebase의 모든 데이터를 초기화하시겠습니까? (이 작업은 되돌릴 수 없습니다)')) {
    const btn = document.getElementById('clear-data-btn');
    btn.textContent = '데이터 삭제 중...';
    btn.disabled = true;

    try {
      const q = query(collection(db, "feedback"));
      const snapshot = await getDocs(q);
      
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      document.getElementById('analysis-content').innerHTML = `
        <div class="text-center py-6">
          <p class="notion-text-gray mb-5">수집된 피드백을 AI로 요약하고 인사이트를 도출해 보세요.</p>
          <button id="run-ai-btn" class="px-5 py-2.5 rounded-md font-medium bg-[#37352f] text-white hover:bg-[#4a4842] transition-colors disabled:opacity-50">
            Gemini AI 분석 시작
          </button>
        </div>
      `;
    } catch (err) {
      console.error("Error clearing data: ", err);
      alert("데이터 삭제 중 오류가 발생했습니다.");
    } finally {
      btn.textContent = '모든 데이터 초기화';
      btn.disabled = false;
    }
  }
}

// Start
init();
