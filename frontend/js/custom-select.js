export function setupCustomSelect(selectEl) {
  // Hide the original select
  selectEl.style.display = 'none';
  
  // Create the custom wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select-wrapper';
  wrapper.tabIndex = 0; // make it focusable
  
  const selectedDisplay = document.createElement('div');
  selectedDisplay.className = 'custom-select-display';
  
  const dropdown = document.createElement('div');
  dropdown.className = 'custom-select-dropdown';
  
  wrapper.appendChild(selectedDisplay);
  wrapper.appendChild(dropdown);
  
  // Insert custom select after original select
  selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
  
  // Populate options
  const options = Array.from(selectEl.options);
  
  function renderOptions() {
    dropdown.innerHTML = '';
    options.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'custom-select-item';
      if (opt.value === selectEl.value) {
        item.classList.add('selected');
        selectedDisplay.textContent = opt.text;
      }
      item.textContent = opt.text;
      
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectEl.value = opt.value;
        selectEl.dispatchEvent(new Event('change'));
        renderOptions();
        wrapper.classList.remove('open');
      });
      dropdown.appendChild(item);
    });
  }
  
  renderOptions();
  
  // Toggle dropdown
  wrapper.addEventListener('click', () => {
    wrapper.classList.toggle('open');
  });
  
  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      wrapper.classList.remove('open');
    }
  });

  // Handle keyboard navigation
  wrapper.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      wrapper.classList.toggle('open');
    }
  });
}
