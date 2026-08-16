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

});
