
// ===== GLOBAL VARIABLES =====
const db = new PouchDB('local-expenses');
let manageMode = false;
let recognition;
let isRecognizing = false;

function displayLocalExpenses() {
  const unsyncedList = document.getElementById('unsynced-list');
  unsyncedList.innerHTML = '';
  db.allDocs({ include_docs: true }).then(result => {
    result.rows.forEach(row => {
      const exp = row.doc;
      const li = document.createElement('li');
      li.textContent = `${exp.date} - $${exp.amount} - ${exp.category} - ${exp.description} 🔄 Not Synced`;
      unsyncedList.appendChild(li);
    });
  });
}

async function refreshSyncedExpenses() {
  const response = await fetch('/api/expenses');
  const data = await response.json();
  const list = document.getElementById('synced-expenses');
  list.innerHTML = '';

  if (data.length === 0) {
    list.innerHTML = '<li>No expenses yet.</li>';
    return;
  }

  data.forEach(exp => {
    const li = document.createElement('li');
    const [year, month] = exp.date.split('-');
    li.setAttribute('data-year', year);
    li.setAttribute('data-month', month);
    li.innerHTML = `
      ${exp.date} - $${exp.amount} - ${exp.category} - ${exp.description} ✅ Synced
      <span class="action-buttons" style="display: none;">
        <button onclick="editExpense(${exp.id}, '${exp.date}', ${exp.amount}, '${exp.category}', '${exp.description}')">✏️</button>
        <button onclick="deleteExpense(${exp.id})">🗑️</button>
      </span>
    `;
    li.className = 'list-group-item';
    list.appendChild(li);
  });

  updateActionButtonsVisibility();
  applyCombinedFilters();
}

function updateActionButtonsVisibility() {
  const buttons = document.querySelectorAll('.action-buttons');
  buttons.forEach(span => {
    span.style.display = manageMode ? 'inline' : 'none';
  });
}

function toggleManageMode() {
  manageMode = !manageMode;
  updateActionButtonsVisibility();
}

const defaultSubmitHandler = async function (e) {
  e.preventDefault();
  const form = document.getElementById('offline-form');
  const formData = new FormData(form);
  const expense = {
    _id: new Date().toISOString(),
    date: formData.get('date'),
    amount: parseFloat(formData.get('amount')),
    category: formData.get('category'),
    description: formData.get('description'),
    synced: false
  };

  if (navigator.onLine) {
    try {
      const res = await fetch('/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([expense])
      });

      if (res.ok) {
        await refreshSyncedExpenses();
        form.reset();
        document.getElementById('sync-status').textContent = "Expense synced directly!";
        return;
      }
    } catch (err) {
      console.warn("[WARN] Sync failed, storing locally.");
    }
  }

  await db.put(expense);
  form.reset();
  displayLocalExpenses();
};

async function syncExpenses() {
  const result = await db.allDocs({ include_docs: true });
  const unsynced = result.rows.map(row => row.doc);
  const syncStatus = document.getElementById('sync-status');

  if (unsynced.length === 0) {
    syncStatus.textContent = "Nothing to sync.";
    return;
  }

  try {
    const res = await fetch('/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(unsynced)
    });

    if (res.ok) {
      for (let exp of unsynced) {
        await db.remove(exp);
      }
      displayLocalExpenses();
      await refreshSyncedExpenses();
      syncStatus.textContent = "Synced successfully!";
    } else {
      syncStatus.textContent = "Server error while syncing.";
    }
  } catch (err) {
    syncStatus.textContent = "Sync failed. Try again later.";
  }
}

function editExpense(id, date, amount, category, description) {
  const form = document.getElementById('offline-form');
  form.date.value = date;
  form.amount.value = amount;
  form.category.value = category;
  form.description.value = description;

  form.onsubmit = async function (e) {
    e.preventDefault();
    const updated = {
      date: form.date.value,
      amount: parseFloat(form.amount.value),
      category: form.category.value,
      description: form.description.value
    };

    const res = await fetch(`/edit-expense/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });

    if (res.ok) {
      await refreshSyncedExpenses();
      form.reset();
      form.onsubmit = defaultSubmitHandler;
    }
  };
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  const res = await fetch(`/delete-expense/${id}`, { method: 'DELETE' });
  if (res.ok) {
    await refreshSyncedExpenses();
  }
}

function toggleSyncButton() {
  const syncBtn = document.getElementById('sync-btn');
  syncBtn.style.display = navigator.onLine ? 'none' : 'inline-block';
}

function applyCombinedFilters() {
  const keyword = document.getElementById('filter-input').value.toLowerCase();
  const selectedYear = document.getElementById('filter-year').value;
  const selectedMonth = document.getElementById('filter-month').value;
  const list = document.getElementById('synced-expenses');
  const items = list.children;

  let total = 0;

  Array.from(items).forEach(li => {
    const text = li.textContent.toLowerCase();
    const itemYear = li.getAttribute('data-year');
    const itemMonth = li.getAttribute('data-month');

    const matchesText = text.includes(keyword);
    const matchesYear = selectedYear === '' || selectedYear === itemYear;
    const matchesMonth = selectedMonth === '' || selectedMonth === itemMonth;

    const visible = matchesText && matchesYear && matchesMonth;
    li.style.display = visible ? '' : 'none';

    if (visible) {
      const match = li.textContent.match(/\$(\d+(\.\d{1,2})?)/);
      if (match) {
        total += parseFloat(match[1]);
      }
    }
  });

  document.getElementById('total-expense').textContent = `Total: $${total.toFixed(2)}`;
}

// DOM-DEPENDENT BINDINGS
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('offline-form');
  form.onsubmit = defaultSubmitHandler;

  document.getElementById('filter-input').addEventListener('input', applyCombinedFilters);
  document.getElementById('filter-year').addEventListener('change', applyCombinedFilters);
  document.getElementById('filter-month').addEventListener('change', applyCombinedFilters);
  document.getElementById('sync-btn').addEventListener('click', syncExpenses);

  window.addEventListener('online', async () => {
    await syncExpenses();
    await refreshSyncedExpenses();
    toggleSyncButton();
  });

  window.addEventListener('offline', toggleSyncButton);

  displayLocalExpenses();
  refreshSyncedExpenses();
  toggleSyncButton();
});


// === VOICE INPUT SETUP ===
document.addEventListener('DOMContentLoaded', () => {
  const voiceBtn = document.getElementById('voice-button');
  const transcriptDisplay = document.createElement('p');
  transcriptDisplay.className = "text-muted mt-2";
  transcriptDisplay.innerHTML = `📝 Heard: <span id="live-transcript">...</span>`;
  voiceBtn.parentNode.insertBefore(transcriptDisplay, voiceBtn.nextSibling);

  if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      document.getElementById('live-transcript').textContent = '';
      voiceBtn.textContent = '🎙️ Listening...';
    };

    recognition.onresult = function(event) {
      let combinedTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        combinedTranscript += event.results[i][0].transcript + ' ';
      }
      combinedTranscript = combinedTranscript.trim().toLowerCase();
      document.getElementById('live-transcript').textContent = combinedTranscript;

      const amountMatch = combinedTranscript.match(/amount\s+(\d+(\.\d+)?)/);
      const categoryMatch = combinedTranscript.match(/category\s+([a-z]+)/);
      const descriptionMatch = combinedTranscript.match(/description\s+(.+)/);

      if (amountMatch) document.querySelector('input[name="amount"]').value = amountMatch[1];
      if (categoryMatch) document.querySelector('input[name="category"]').value = categoryMatch[1];
      if (descriptionMatch) document.querySelector('input[name="description"]').value = descriptionMatch[1];
    };

    recognition.onerror = function(event) {
      alert("Voice input error: " + event.error);
    };

    recognition.onend = () => {
      isRecognizing = false;
      voiceBtn.textContent = '🎤 Hold to Speak';
    };

    voiceBtn.addEventListener('mousedown', startListening);
    voiceBtn.addEventListener('mouseup', stopListening);
    voiceBtn.addEventListener('mouseleave', stopListening);
    voiceBtn.addEventListener('touchstart', startListening);
    voiceBtn.addEventListener('touchend', stopListening);
  } else {
    alert("Your browser does not support speech recognition.");
  }
});

function startListening(e) {
  e.preventDefault();
  if (recognition && !isRecognizing) {
    recognition.start();
    isRecognizing = true;
  }
}

function stopListening(e) {
  e.preventDefault();
  if (recognition && isRecognizing) {
    recognition.stop();
    isRecognizing = false;
  }
}

// === CSV EXPORT ===
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('download-btn').addEventListener('click', async () => {
    const res = await fetch('/api/expenses');
    const data = await res.json();
    if (!data.length) return alert("No expenses to download.");

    let csv = "Date,Amount,Category,Description\n";
    data.forEach(row => {
      csv += `"${row.date}","${row.amount}","${row.category.replace(/"/g, '""')}","${row.description.replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my_expenses.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
});

// === SHARING ===
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('share-btn').addEventListener('click', async () => {
    const res = await fetch('/api/expenses');
    const data = await res.json();
    if (!data.length) return alert("No expenses to share.");

    let text = "📊 My Recent Expenses:\n\n";
    data.forEach(row => {
      text += `📅 ${row.date} | 💵 $${row.amount} | 🏷️ ${row.category} | 📝 ${row.description}\n`;
    });

    if (navigator.share) {
      try {
        await navigator.share({ title: "My Expenses", text });
      } catch (err) {
        alert("Sharing cancelled.");
      }
    } else {
      const encoded = encodeURIComponent(text);
      const popup = document.createElement('div');
      popup.innerHTML = `
        <p>Share using:</p>
        <ul>
          <li><a href="mailto:?subject=My Expenses&body=${encoded}" target="_blank">📧 Email</a></li>
          <li><a href="https://wa.me/?text=${encoded}" target="_blank">🟢 WhatsApp</a></li>
          <li><a href="https://t.me/share/url?url=${encoded}" target="_blank">🔵 Telegram</a></li>
          <li><button onclick="navigator.clipboard.writeText(decodeURIComponent('${encoded}')); alert('Copied!')">📋 Copy</button></li>
        </ul>
      `;
      popup.style.position = 'fixed';
      popup.style.bottom = '20px';
      popup.style.right = '20px';
      popup.style.padding = '1rem';
      popup.style.background = '#fff';
      popup.style.border = '1px solid #ccc';
      popup.style.zIndex = 9999;
      document.body.appendChild(popup);
      setTimeout(() => popup.remove(), 15000);
    }
  });
});