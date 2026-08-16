/* ═══════════════════════════════════════════════════════════
   CAMPUS PORTAL — Application Logic
   Navigation, tab filtering, sidebar toggle, and animations
   ═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // ── DOM References ──
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const menuToggle = document.getElementById('menuToggle');
  const pageTitle = document.getElementById('pageTitle');
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  const pagePanels = document.querySelectorAll('.page-panel');
  const quickActions = document.querySelectorAll('[data-navigate]');


  const pageTitles = {
    'dashboard': 'Dashboard',
    'timetable': 'Timetable',
    'attendance': 'Attendance',
    'notes': 'Notes & Resources',
    'dept-cs': 'Computer Science',
    'dept-mech': 'Mechanical Engg.',
    'dept-eee': 'Electrical Engg.',
    'dept-civil': 'Civil Engg.',
    'dept-ece': 'Electronics & Comm.',
    'admin': 'Admin Console'
  };

  // ── Navigation ──
  function navigateTo(pageId) {
    // Deactivate all nav items and pages
    navItems.forEach(n => n.classList.remove('active'));
    pagePanels.forEach(p => p.classList.remove('active'));

    // Activate target
    const targetNav = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    const targetPanel = document.getElementById(`page-${pageId}`);

    if (targetNav) targetNav.classList.add('active');
    if (targetPanel) {
      targetPanel.classList.add('active');
      // Re-trigger entrance animation only on the target panel
      const content = targetPanel.querySelector('.page-content');
      if (content) {
        content.style.animation = 'none';
        requestAnimationFrame(() => {
          content.style.animation = '';
        });
      }
    }

    // Update page title
    pageTitle.textContent = pageTitles[pageId] || 'Dashboard';

    // Animate attendance bars when attendance page opens
    if (pageId === 'attendance') {
      animateAttendanceBars();
    }

    // Close sidebar on mobile after navigation
    closeSidebar();
  }

  // Sidebar nav clicks
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navigateTo(item.dataset.page);
    });
  });

  // Quick action clicks
  quickActions.forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo(btn.dataset.navigate);
    });
  });

  // ── Sidebar Toggle (Mobile) ──
  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      if (sidebar.classList.contains('open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }

  // ── Department Tab Filtering ──
  function initTabFiltering(tabContainerId) {
    const container = document.getElementById(tabContainerId);
    if (!container) return;

    const tabs = container.querySelectorAll('.dept-tab');
    // Find the parent page-panel -> then find filterable items
    const pagePanel = container.closest('.page-panel');
    if (!pagePanel) return;

    const filterableItems = pagePanel.querySelectorAll('[data-dept-filter]');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const dept = tab.dataset.dept;

        // Filter items
        filterableItems.forEach(item => {
          if (dept === 'all' || item.dataset.deptFilter === dept) {
            item.style.display = '';
            // Re-trigger animation
            item.style.animation = 'none';
            item.offsetHeight;
            item.style.animation = 'fadeSlideUp .4s var(--ease-out) both';
          } else {
            item.style.display = 'none';
          }
        });

        // Animate attendance bars if we're in attendance view
        if (tabContainerId === 'attendanceTabs') {
          animateAttendanceBars();
        }
      });
    });
  }

  // Initialize all tab containers
  initTabFiltering('timetableTabs');
  initTabFiltering('attendanceTabs');
  initTabFiltering('notesTabs');

  // ── Attendance Bar Animation ──
  function animateAttendanceBars() {
    const bars = document.querySelectorAll('.att-bar-fill');
    bars.forEach(bar => {
      const targetWidth = bar.style.width;
      bar.style.width = '0%';
      // Delay for stagger effect
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bar.style.width = targetWidth;
        });
      });
    });
  }

  // ── Keyboard Shortcuts ──
  document.addEventListener('keydown', (e) => {
    // Escape closes sidebar
    if (e.key === 'Escape') {
      closeSidebar();
    }
  });

  // ── Intersection Observer for stagger animations ──
  const staggerContainers = document.querySelectorAll('.stagger');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1 });

  staggerContainers.forEach(container => {
    observer.observe(container);
  });

  // ── Note card click feedback ──
  document.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => {
      // Brief pulse feedback
      card.style.transform = 'scale(.98)';
      setTimeout(() => {
        card.style.transform = '';
      }, 150);
    });
  });

  // ── Initialize ──
  // Check role to show Admin UI
  try {
    const sessionRaw = sessionStorage.getItem('campus_portal_user');
    if (sessionRaw) {
      const session = JSON.parse(sessionRaw);
      if (session.role === 'admin') {
        const titleEl = document.getElementById('nav-admin-title');
        const itemEl = document.getElementById('nav-admin');
        if (titleEl) titleEl.style.display = 'block';
        if (itemEl) itemEl.style.display = 'flex';
      }
    }
  } catch (e) { /* ignore */ }

  // Animate attendance bars on initial load if attendance is visible
  animateAttendanceBars();

  // ── API Fetch & Render Logic ──
  
  async function fetchAnnouncements() {
    try {
      const res = await fetch('/api/announcements');
      if (!res.ok) return;
      const data = await res.json();
      const container = document.getElementById('dynamicAnnouncements');
      if (!container) return;
      container.innerHTML = '';
      if (data.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No announcements yet.</p>';
      }
      data.forEach(ann => {
        container.innerHTML += `
          <div class="announcement-card">
              <div class="ann-date">${ann.date} • ${ann.department}</div>
              <div class="ann-title">${ann.title}</div>
              <div class="ann-body">${ann.body}</div>
              <span class="ann-tag ${ann.tag.toLowerCase()}">${ann.tag}</span>
          </div>
        `;
      });
    } catch (e) {
      console.error('Error fetching announcements', e);
    }
  }

  async function fetchNotes() {
    try {
      const res = await fetch('/api/notes');
      if (!res.ok) return;
      const data = await res.json();
      const container = document.getElementById('dynamicNotes');
      if (!container) return;
      container.innerHTML = '';
      if (data.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No notes uploaded yet.</p>';
      }
      data.forEach(note => {
        container.innerHTML += `
          <div class="note-card" data-dept-filter="${note.department}">
              <div class="note-icon pdf"><span class="material-symbols-outlined">description</span></div>
              <div class="note-details">
                  <div class="note-name">${note.title}</div>
                  <div class="note-meta"><span>${note.professor}</span><span>${note.file_size}</span><span>${note.upload_date}</span></div>
              </div>
              <a href="${note.file_path}" target="_blank" style="color: inherit; text-decoration: none;">
                <span class="note-action material-symbols-outlined">download</span>
              </a>
          </div>
        `;
      });
    } catch (e) {
      console.error('Error fetching notes', e);
    }
  }

  async function fetchVideos() {
    try {
      const res = await fetch('/api/videos');
      if (!res.ok) return;
      const data = await res.json();
      const container = document.getElementById('dynamicVideos');
      if (!container) return;
      container.innerHTML = '';
      if (data.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No videos added yet.</p>';
      }
      data.forEach(video => {
        container.innerHTML += `
          <div class="note-card" data-dept-filter="${video.department}">
              <div class="note-icon link"><span class="material-symbols-outlined">play_circle</span></div>
              <div class="note-details">
                  <div class="note-name">${video.title}</div>
                  <div class="note-meta"><span>${video.description}</span><span>External Link</span><span>${video.upload_date}</span></div>
              </div>
              <a href="${video.url}" target="_blank" style="color: inherit; text-decoration: none;">
                <span class="note-action material-symbols-outlined">open_in_new</span>
              </a>
          </div>
        `;
      });
    } catch (e) {
      console.error('Error fetching videos', e);
    }
  }

  // Initial Fetch
  fetchAnnouncements();
  fetchNotes();
  fetchVideos();

  // Admin Form Submissions
  const annForm = document.getElementById('adminAnnForm');
  if (annForm) {
    annForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = annForm.querySelector('button');
      btn.classList.add('loading');
      const payload = {
        title: document.getElementById('annTitle').value,
        body: document.getElementById('annBody').value,
        department: document.getElementById('annDept').value,
        tag: document.getElementById('annTag').value
      };
      await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      annForm.reset();
      btn.classList.remove('loading');
      fetchAnnouncements();
      alert('Announcement posted!');
    });
  }

  const videoForm = document.getElementById('adminVideoForm');
  if (videoForm) {
    videoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = videoForm.querySelector('button');
      btn.classList.add('loading');
      const payload = {
        title: document.getElementById('videoTitle').value,
        description: document.getElementById('videoDesc').value,
        department: document.getElementById('videoDept').value,
        url: document.getElementById('videoUrl').value
      };
      await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      videoForm.reset();
      btn.classList.remove('loading');
      fetchVideos();
      alert('Video added!');
    });
  }

  const noteForm = document.getElementById('adminNoteForm');
  if (noteForm) {
    noteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = noteForm.querySelector('button');
      btn.classList.add('loading');
      const formData = new FormData();
      formData.append('title', document.getElementById('noteTitle').value);
      formData.append('professor', document.getElementById('noteProf').value);
      formData.append('department', document.getElementById('noteDept').value);
      formData.append('noteFile', document.getElementById('noteFile').files[0]);
      
      await fetch('/api/notes', {
        method: 'POST',
        body: formData // Note: no Content-Type header needed for FormData
      });
      noteForm.reset();
      btn.classList.remove('loading');
      fetchNotes();
      alert('Note uploaded!');
    });
  }

});
