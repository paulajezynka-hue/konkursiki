const STORAGE_KEY = 'contest-tracker-state-v1';
const PROFILES_KEY = 'contest-tracker-profiles-v1';
const ACTIVE_PROFILE_KEY = 'contest-tracker-active-profile-v1';
const savedActiveProfileId = localStorage.getItem(ACTIVE_PROFILE_KEY);
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAzk4n3tSSsoRRb8WNkTFGtqhbNwmj6NXk',
  authDomain: 'konkursiki.firebaseapp.com',
  projectId: 'konkursiki',
  storageBucket: 'konkursiki.firebasestorage.app',
  messagingSenderId: '22692945288',
  appId: '1:22692945288:web:be7d4c46de7ab676dc6e3d',
};

const STATUS = {
  ONGOING: 'ongoing',
  PENDING: 'pending',
  RESULTS: 'results',
};

const state = {
  profiles: loadProfiles(),
  activeProfileId: localStorage.getItem(ACTIVE_PROFILE_KEY),
  contests: [],
  editingId: null,
  resultChoice: null,
  historyMode: false,
};

let realtimeSource = null;
let firestore = null;
let unsubscribeFirestore = null;

if (!state.activeProfileId || !state.profiles.some((profile) => profile.id === state.activeProfileId)) {
  state.activeProfileId = state.profiles[0].id;
  localStorage.setItem(ACTIVE_PROFILE_KEY, state.activeProfileId);
}

state.contests = getActiveProfile().contests;

const elements = {
  profileToggleBtn: document.getElementById('profileToggleBtn'),
  profileName: document.getElementById('profileName'),
  realtimeStatus: document.getElementById('realtimeStatus'),
  profileModal: document.getElementById('profileModal'),
  profileForm: document.getElementById('profileForm'),
  profileSelect: document.getElementById('profileSelect'),
  newProfileWrap: document.getElementById('newProfileWrap'),
  newProfileName: document.getElementById('newProfileName'),
  deleteProfileBtn: document.getElementById('deleteProfileBtn'),
  historyToggleBtn: document.getElementById('historyToggleBtn'),
  addContestBtn: document.getElementById('addContestBtn'),
  modal: document.getElementById('contestModal'),
  modalTitle: document.getElementById('modalTitle'),
  contestForm: document.getElementById('contestForm'),
  contestId: document.getElementById('contestId'),
  contestTitle: document.getElementById('contestTitle'),
  contestDescription: document.getElementById('contestDescription'),
  contestStatus: document.getElementById('contestStatus'),
  resultDate: document.getElementById('resultDate'),
  todoCheckbox: document.getElementById('todoCheckbox'),
  todoText: document.getElementById('todoText'),
  todoFieldWrap: document.getElementById('todoFieldWrap'),
  deleteContestBtn: document.getElementById('deleteContestBtn'),
  todoList: document.getElementById('todoList'),
  ongoingList: document.getElementById('ongoingList'),
  pendingList: document.getElementById('pendingList'),
  resultsList: document.getElementById('resultsList'),
  todoCount: document.getElementById('todoCount'),
  ongoingCount: document.getElementById('ongoingCount'),
  pendingCount: document.getElementById('pendingCount'),
  resultsCount: document.getElementById('resultsCount'),
  todayLabel: document.getElementById('todayLabel'),
  resultModal: document.getElementById('resultModal'),
  resultContestName: document.getElementById('resultContestName'),
  resultNoteWrap: document.getElementById('resultNoteWrap'),
  resultNoteInput: document.getElementById('resultNoteInput'),
  saveResultBtn: document.getElementById('saveResultBtn'),
  boardView: document.getElementById('boardView'),
  historyView: document.getElementById('historyView'),
  historyList: document.getElementById('historyList'),
};

function loadProfiles() {
  try {
    const profilesRaw = localStorage.getItem(PROFILES_KEY);
    if (profilesRaw) {
      const profiles = JSON.parse(profilesRaw);
      if (Array.isArray(profiles) && profiles.length) return profiles;
    }

    const legacyRaw = localStorage.getItem(STORAGE_KEY);
    const legacyContests = legacyRaw ? JSON.parse(legacyRaw) : [];
    const migratedProfiles = [{ id: crypto.randomUUID(), name: 'Paula', contests: Array.isArray(legacyContests) ? legacyContests : [] }];
    localStorage.setItem(PROFILES_KEY, JSON.stringify(migratedProfiles));
    return migratedProfiles;
  } catch (error) {
    console.error('Błąd odczytu profili z localStorage:', error);
    return [{ id: crypto.randomUUID(), name: 'Paula', contests: [] }];
  }
}

function getActiveProfile() {
  return state.profiles.find((profile) => profile.id === state.activeProfileId) || state.profiles[0];
}

function persistProfiles() {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(state.profiles));
  syncProfilesToServer();
}

function setRealtimeStatus(text, connected) {
  elements.realtimeStatus.textContent = text;
  elements.realtimeStatus.classList.toggle('connected', connected);
}

async function syncProfilesToServer() {
  if (firestore) {
    try {
      await firestore.collection('appState').doc('profiles').set({ profiles: state.profiles, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      return;
    } catch (error) {
      setRealtimeStatus('lokalnie', false);
    }
  }

  try {
    await fetch('/api/profiles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profiles: state.profiles }),
    });
  } catch (error) {
    setRealtimeStatus('lokalnie', false);
  }
}

function applyRemoteProfiles(profiles) {
  if (!Array.isArray(profiles) || !profiles.length) return;

  state.profiles = profiles;
  if (!state.profiles.some((profile) => profile.id === state.activeProfileId)) {
    state.activeProfileId = state.profiles[0].id;
    localStorage.setItem(ACTIVE_PROFILE_KEY, state.activeProfileId);
  }
  state.contests = getActiveProfile().contests || [];
  localStorage.setItem(PROFILES_KEY, JSON.stringify(state.profiles));
  render();
  if (!elements.profileModal.classList.contains('hidden')) renderProfileOptions();
}

async function connectRealtime() {
  if (window.firebase) {
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      firestore = firebase.firestore();
      const snapshot = await firestore.collection('appState').doc('profiles').get();
      const remotePayload = snapshot.exists ? snapshot.data() : null;

      if (remotePayload && Array.isArray(remotePayload.profiles) && remotePayload.profiles.length) {
        applyRemoteProfiles(remotePayload.profiles);
      } else if (state.profiles.length) {
        await syncProfilesToServer();
      }

      unsubscribeFirestore = firestore.collection('appState').doc('profiles').onSnapshot((cloudSnapshot) => {
        const payload = cloudSnapshot.exists ? cloudSnapshot.data() : null;
        if (payload && Array.isArray(payload.profiles)) applyRemoteProfiles(payload.profiles);
      });
      setRealtimeStatus('na żywo', true);
      return;
    } catch (error) {
      console.error('Firebase nie jest dostępny:', error);
      firestore = null;
    }
  }

  try {
    const response = await fetch('/api/profiles');
    if (!response.ok) throw new Error('Serwer synchronizacji jest niedostępny.');

    const remotePayload = await response.json();
    if (Array.isArray(remotePayload.profiles) && remotePayload.profiles.length) {
      applyRemoteProfiles(remotePayload.profiles);
    } else if (state.profiles.length) {
      await syncProfilesToServer();
    }

    realtimeSource = new EventSource('/events');
    realtimeSource.addEventListener('profiles', (event) => {
      const payload = JSON.parse(event.data);
      applyRemoteProfiles(payload.profiles);
    });
    realtimeSource.onopen = () => setRealtimeStatus('na żywo', true);
    realtimeSource.onerror = () => setRealtimeStatus('lokalnie', false);
  } catch (error) {
    setRealtimeStatus('lokalnie', false);
  }
}

function persistContests() {
  getActiveProfile().contests = state.contests;
  persistProfiles();
}

function renderProfileOptions() {
  elements.profileSelect.innerHTML = state.profiles
    .map((profile) => `<option value="${profile.id}">${escapeHtml(profile.name)}</option>`)
    .join('') + '<option value="new">＋ Nowy profil</option>';
  elements.profileSelect.value = state.activeProfileId;
  elements.deleteProfileBtn.disabled = state.profiles.length <= 1 || elements.profileSelect.value === 'new';
}

function openProfileModal() {
  renderProfileOptions();
  elements.newProfileName.value = '';
  elements.newProfileWrap.classList.add('hidden');
  elements.profileModal.classList.remove('hidden');
  elements.profileModal.setAttribute('aria-hidden', 'false');
}

function closeProfileModal() {
  elements.profileModal.classList.add('hidden');
  elements.profileModal.setAttribute('aria-hidden', 'true');
}

function switchProfile(profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile) return;

  state.activeProfileId = profile.id;
  state.contests = profile.contests || [];
  state.historyMode = false;
  state.editingId = null;
  localStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
  closeProfileModal();
  render();
}

function createProfile(name) {
  const cleanName = name.trim();
  if (!cleanName) return;

  const alreadyExists = state.profiles.some((profile) => profile.name.toLowerCase() === cleanName.toLowerCase());
  if (alreadyExists) {
    elements.newProfileName.setCustomValidity('Taki profil już istnieje.');
    elements.newProfileName.reportValidity();
    return;
  }

  elements.newProfileName.setCustomValidity('');
  const profile = { id: crypto.randomUUID(), name: cleanName, contests: [] };
  state.profiles.push(profile);
  persistProfiles();
  switchProfile(profile.id);
}

function deleteSelectedProfile() {
  const profileId = elements.profileSelect.value;
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile || state.profiles.length <= 1) return;

  const confirmed = window.confirm(`Usunąć profil „${profile.name}” razem z jego konkursami?`);
  if (!confirmed) return;

  state.profiles = state.profiles.filter((item) => item.id !== profile.id);
  persistProfiles();

  if (profile.id === state.activeProfileId) {
    switchProfile(state.profiles[0].id);
    return;
  }

  renderProfileOptions();
}

function formatDate(dateString) {
  if (!dateString) return 'brak daty';
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function formatToday() {
  return new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createContest(data) {
  const nextStatus = data.todo ? STATUS.ONGOING : STATUS.PENDING;

  return {
    id: crypto.randomUUID(),
    title: data.title.trim(),
    description: data.description.trim(),
    status: nextStatus,
    resultDate: data.resultDate || '',
    todo: Boolean(data.todo),
    todoText: data.todo ? data.todoText.trim() : '',
    todoDone: false,
    outcome: null,
    resultNote: '',
    createdAt: Date.now(),
  };
}

function syncContestStatuses() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  state.contests.forEach((contest) => {
    if (contest.todoDone) {
      contest.todo = false;
      contest.status = STATUS.PENDING;
    }

    if (contest.resultDate) {
      const date = new Date(`${contest.resultDate}T00:00:00`);
      if (date <= today && contest.status !== STATUS.RESULTS && contest.outcome === null) {
        contest.status = STATUS.RESULTS;
      }
    }

    if (contest.status === STATUS.RESULTS && contest.outcome !== null) {
      contest.todo = false;
    }
  });
}

function renderHistory() {
  const historyItems = state.contests.filter((contest) => contest.status === STATUS.RESULTS && contest.outcome !== null);

  if (!historyItems.length) {
    elements.historyList.innerHTML = '<div class="history-empty">Brak wpisów w historii</div>';
    return;
  }

  elements.historyList.innerHTML = historyItems
    .map((contest) => {
      const resultText = contest.outcome === 'win' ? 'Wygrana' : 'Nie';
      const note = contest.resultNote ? `<p class="history-note">${escapeHtml(contest.resultNote)}</p>` : '';

      return `
        <article class="history-card ${contest.outcome === 'win' ? 'history-win' : 'history-lose'}">
          <div class="history-head">
            <h3>${escapeHtml(contest.title)}</h3>
            <span class="tag ${contest.outcome === 'win' ? 'result-tag win' : 'result-tag lose'}">${resultText}</span>
          </div>
          <p class="history-meta">Wyniki: ${formatDate(contest.resultDate)}</p>
          ${note}
        </article>
      `;
    })
    .join('');
}

function renderColumn(container, items) {
  if (!items.length) {
    container.innerHTML = '<div class="empty-state">Brak wpisów</div>';
    return;
  }

  container.innerHTML = items
    .map((contest) => {
      const resultBadge = contest.outcome === 'win'
        ? '<span class="tag result-tag win">Wygrana</span>'
        : contest.outcome === 'lose'
          ? '<span class="tag result-tag lose">Nie</span>'
          : '';

      const resultNote = contest.resultNote ? `<div class="result-note">${escapeHtml(contest.resultNote)}</div>` : '';

      return `
        <article class="contest-card ${contest.outcome === 'win' ? 'result-win' : contest.outcome === 'lose' ? 'result-lose' : ''}" data-id="${contest.id}">
          <div class="card-top">
            <h3>${escapeHtml(contest.title)}</h3>
            <button class="icon-btn" type="button" data-action="edit" data-id="${contest.id}" aria-label="Edytuj konkurs">✎</button>
          </div>

          ${contest.description ? `<p class="todo-note">${escapeHtml(contest.description)}</p>` : ''}

          <div class="card-meta">
            ${contest.resultDate ? `<span class="tag">Wyniki: ${formatDate(contest.resultDate)}</span>` : ''}
            ${contest.todo && !contest.todoDone ? '<span class="tag todo-tag">To do</span>' : ''}
            ${resultBadge}
          </div>

          ${contest.todo && contest.todoText ? `<div class="todo-note">${escapeHtml(contest.todoText)}</div>` : ''}

          <div class="card-actions">
            ${contest.todo && !contest.todoDone ? '<button class="todo-btn" type="button" data-action="toggle-todo" data-id="${contest.id}">Zrobione</button>' : ''}
            ${contest.status !== STATUS.ONGOING ? `<button class="status-btn" type="button" data-action="move" data-target="${STATUS.ONGOING}" data-id="${contest.id}">W trakcie</button>` : ''}
            ${contest.status !== STATUS.PENDING ? `<button class="status-btn" type="button" data-action="move" data-target="${STATUS.PENDING}" data-id="${contest.id}">Oczekujące</button>` : ''}
            ${contest.status !== STATUS.RESULTS ? `<button class="status-btn" type="button" data-action="move" data-target="${STATUS.RESULTS}" data-id="${contest.id}">Wyniki</button>` : ''}
            ${contest.status === STATUS.RESULTS ? `<button class="result-btn" type="button" data-action="open-result-modal" data-id="${contest.id}">Wynik</button>` : ''}
          </div>

          ${resultNote}
        </article>
      `;
    })
    .join('');
}

function renderTodoColumn(container, items) {
  if (!items.length) {
    container.innerHTML = '<div class="empty-state">Brak wpisów</div>';
    return;
  }

  container.innerHTML = items
    .map((contest) => `
      <article class="contest-card todo-card" data-id="${contest.id}">
        <p class="todo-task">${escapeHtml(contest.todoText || contest.title)}</p>
        <button class="todo-btn" type="button" data-action="toggle-todo" data-id="${contest.id}">Zrobione</button>
      </article>
    `)
    .join('');
}

function render() {
  syncContestStatuses();

  const todoItems = state.contests.filter((contest) => contest.todo && !contest.todoDone);
  const ongoingItems = state.contests.filter((contest) => contest.status === STATUS.ONGOING);
  const pendingItems = state.contests.filter((contest) => contest.status === STATUS.PENDING);
  const resultsItems = state.contests.filter((contest) => contest.status === STATUS.RESULTS && contest.outcome === null);

  renderTodoColumn(elements.todoList, todoItems);
  renderColumn(elements.ongoingList, ongoingItems);
  renderColumn(elements.pendingList, pendingItems);
  renderColumn(elements.resultsList, resultsItems);
  renderHistory();

  elements.boardView.classList.toggle('hidden', state.historyMode);
  elements.historyView.classList.toggle('hidden', !state.historyMode);
  elements.historyToggleBtn.textContent = state.historyMode ? '←' : '🗓️';
  elements.historyToggleBtn.setAttribute('aria-label', state.historyMode ? 'Wróć do tablicy' : 'Otwórz historię');
  elements.historyToggleBtn.setAttribute('title', state.historyMode ? 'Wróć do tablicy' : 'Otwórz historię');
  const activeProfile = getActiveProfile();
  elements.profileName.textContent = activeProfile.name;
  elements.profileToggleBtn.querySelector('.profile-avatar').textContent = activeProfile.name.charAt(0).toUpperCase();

  elements.todoCount.textContent = String(todoItems.length);
  elements.ongoingCount.textContent = String(ongoingItems.length);
  elements.pendingCount.textContent = String(pendingItems.length);
  elements.resultsCount.textContent = String(resultsItems.length);
  elements.todayLabel.textContent = `Dziś: ${formatToday()}`;
}

function openAddModal() {
  state.editingId = null;
  elements.modalTitle.textContent = 'Dodaj konkurs';
  elements.contestForm.reset();
  elements.contestId.value = '';
  elements.deleteContestBtn.classList.add('hidden');
  elements.todoFieldWrap.classList.add('hidden');
  elements.contestStatus.value = STATUS.PENDING;
  elements.todoCheckbox.checked = false;
  elements.modal.classList.remove('hidden');
  elements.modal.setAttribute('aria-hidden', 'false');
  elements.contestTitle.focus();
}

function closeModal() {
  state.editingId = null;
  elements.modal.classList.add('hidden');
  elements.modal.setAttribute('aria-hidden', 'true');
  elements.contestForm.reset();
  elements.todoFieldWrap.classList.add('hidden');
  elements.deleteContestBtn.classList.add('hidden');
}

function openEditModal(id) {
  const contest = state.contests.find((item) => item.id === id);
  if (!contest) return;

  state.editingId = id;
  elements.modalTitle.textContent = 'Edytuj konkurs';
  elements.contestId.value = contest.id;
  elements.contestTitle.value = contest.title;
  elements.contestDescription.value = contest.description;
  elements.contestStatus.value = contest.status;
  elements.resultDate.value = contest.resultDate || '';
  elements.todoCheckbox.checked = Boolean(contest.todo);
  elements.todoText.value = contest.todoText || '';
  elements.todoFieldWrap.classList.toggle('hidden', !contest.todo);
  elements.deleteContestBtn.classList.remove('hidden');
  elements.modal.classList.remove('hidden');
  elements.modal.setAttribute('aria-hidden', 'false');
  elements.contestTitle.focus();
}

function updateContestFromForm(id) {
  const title = elements.contestTitle.value.trim();
  const description = elements.contestDescription.value.trim();
  const status = elements.contestStatus.value;
  const resultDate = elements.resultDate.value;
  const todoChecked = elements.todoCheckbox.checked;
  const todoText = elements.todoText.value.trim();

  const nextStatus = todoChecked ? STATUS.ONGOING : STATUS.PENDING;

  if (!title) {
    elements.contestTitle.focus();
    return;
  }

  if (id) {
    const contest = state.contests.find((item) => item.id === id);
    if (!contest) return;

    contest.title = title;
    contest.description = description;
    contest.status = nextStatus;
    contest.resultDate = resultDate;
    contest.todo = todoChecked;
    contest.todoText = todoChecked ? todoText : '';
    contest.todoDone = contest.todoDone && todoChecked;
    contest.outcome = contest.outcome && contest.status === STATUS.RESULTS ? contest.outcome : null;
  } else {
    const contest = createContest({
      title,
      description,
      status: nextStatus,
      resultDate,
      todo: todoChecked,
      todoText,
    });
    state.contests.unshift(contest);
  }

  persistContests();
  closeModal();
  render();
}

function deleteContest() {
  if (!state.editingId) return;
  state.contests = state.contests.filter((item) => item.id !== state.editingId);
  persistContests();
  closeModal();
  render();
}

function toggleTodoDone(id) {
  const contest = state.contests.find((item) => item.id === id);
  if (!contest || !contest.todo) return;

  contest.todo = false;
  contest.todoDone = true;
  contest.outcome = null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const resultDate = contest.resultDate ? new Date(`${contest.resultDate}T00:00:00`) : null;
  contest.status = resultDate && resultDate <= today ? STATUS.RESULTS : STATUS.PENDING;

  persistContests();
  render();
}

function moveContest(id, targetStatus) {
  const contest = state.contests.find((item) => item.id === id);
  if (!contest) return;

  contest.status = targetStatus;
  if (targetStatus === STATUS.ONGOING) {
    contest.todo = false;
  }

  if (targetStatus !== STATUS.RESULTS) {
    contest.outcome = null;
  }

  persistContests();
  render();
}

function openResultModal(id) {
  const contest = state.contests.find((item) => item.id === id);
  if (!contest) return;

  state.editingId = id;
  state.resultChoice = contest.outcome || null;
  elements.resultContestName.textContent = `${contest.title} • Wyniki ${formatDate(contest.resultDate)}`;
  elements.resultNoteInput.value = contest.resultNote || '';
  elements.resultNoteWrap.classList.toggle('hidden', state.resultChoice !== 'win');
  updateResultChoiceButtons();
  elements.resultModal.classList.remove('hidden');
  elements.resultModal.setAttribute('aria-hidden', 'false');
}

function closeResultModal() {
  state.editingId = null;
  state.resultChoice = null;
  elements.resultModal.classList.add('hidden');
  elements.resultModal.setAttribute('aria-hidden', 'true');
  elements.resultNoteWrap.classList.add('hidden');
  elements.resultNoteInput.value = '';
  updateResultChoiceButtons();
}

function updateResultChoiceButtons() {
  document.querySelectorAll('[data-result-choice]').forEach((button) => {
    button.classList.toggle('active', button.dataset.resultChoice === state.resultChoice);
  });
}

function saveResult(choice) {
  const contest = state.contests.find((item) => item.id === state.editingId);
  if (!contest) return;

  contest.status = STATUS.RESULTS;
  contest.outcome = choice;
  contest.resultNote = choice === 'win' ? elements.resultNoteInput.value.trim() : '';
  contest.todo = false;
  contest.todoDone = false;
  contest.todoText = '';

  persistContests();
  closeResultModal();
  render();
}

function toggleHistoryView() {
  state.historyMode = !state.historyMode;
  render();
}

function handleBoardClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;
  const target = button.dataset.target;

  if (action === 'edit') {
    openEditModal(id);
    return;
  }

  if (action === 'toggle-todo') {
    toggleTodoDone(id);
    return;
  }

  if (action === 'move') {
    moveContest(id, target);
    return;
  }

  if (action === 'open-result-modal') {
    openResultModal(id);
  }
}

function registerEvents() {
  elements.profileToggleBtn.addEventListener('click', openProfileModal);
  elements.historyToggleBtn.addEventListener('click', toggleHistoryView);
  elements.addContestBtn.addEventListener('click', openAddModal);

  elements.profileSelect.addEventListener('change', () => {
    const isNewProfile = elements.profileSelect.value === 'new';
    elements.newProfileWrap.classList.toggle('hidden', !isNewProfile);
    if (isNewProfile) elements.newProfileName.focus();
    elements.deleteProfileBtn.disabled = isNewProfile || state.profiles.length <= 1;
  });

  elements.deleteProfileBtn.addEventListener('click', deleteSelectedProfile);

  elements.profileForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (elements.profileSelect.value === 'new') {
      createProfile(elements.newProfileName.value);
      return;
    }
    switchProfile(elements.profileSelect.value);
  });

  elements.contestForm.addEventListener('submit', (event) => {
    event.preventDefault();
    updateContestFromForm(state.editingId || null);
  });

  elements.deleteContestBtn.addEventListener('click', deleteContest);

  elements.todoCheckbox.addEventListener('change', () => {
    elements.todoFieldWrap.classList.toggle('hidden', !elements.todoCheckbox.checked);
    if (elements.todoCheckbox.checked) {
      elements.todoText.focus();
    }
  });

  document.addEventListener('click', (event) => {
    const closeProfileTarget = event.target.closest('[data-close-profile="true"]');
    if (closeProfileTarget) {
      closeProfileModal();
      return;
    }

    const closeTarget = event.target.closest('[data-close="true"]');
    if (closeTarget) {
      closeModal();
      return;
    }

    const closeResultTarget = event.target.closest('[data-close-result="true"]');
    if (closeResultTarget) {
      closeResultModal();
      return;
    }

    const resultChoiceBtn = event.target.closest('[data-result-choice]');
    if (resultChoiceBtn) {
      state.resultChoice = resultChoiceBtn.dataset.resultChoice;
      updateResultChoiceButtons();
      elements.resultNoteWrap.classList.toggle('hidden', state.resultChoice !== 'win');
      if (state.resultChoice === 'win') {
        elements.resultNoteInput.focus();
      } else {
        elements.resultNoteInput.value = '';
      }
      return;
    }

    const saveBtn = event.target.closest('#saveResultBtn');
    if (saveBtn) {
      if (state.resultChoice) {
        saveResult(state.resultChoice);
      }
      return;
    }

    if (event.target.closest('[data-action]')) {
      handleBoardClick(event);
    }
  });
}

registerEvents();
render();
if (!savedActiveProfileId) {
  openProfileModal();
}
connectRealtime();
