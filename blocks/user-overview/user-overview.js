import { createOptimizedPicture } from '../../scripts/aem.js';

const USER_INDEX_URL = '/user-index.json';

/**
 * Checks if a user has valid metadata (non-empty fields)
 * @param {Object} user - User data object
 * @returns {boolean} - True if user has valid metadata
 */
function hasValidMetadata(user) {
  return user.userEmail 
    && user.userFullname 
    && user.userCity 
    && user.userCountry
    && user.userPicture;
}

/**
 * Creates a user card element
 * @param {Object} user - User data object
 * @returns {HTMLElement} - List item with user card
 */
function createUserCard(user) {
  const li = document.createElement('li');
  li.className = 'user-overview-card';

  // User image
  const imageDiv = document.createElement('div');
  imageDiv.className = 'user-overview-card-image';
  
  if (user.userPicture) {
    const picture = createOptimizedPicture(
      user.userPicture, 
      user.userFullname || 'User',
      false,
      [{ width: '200' }]
    );
    imageDiv.appendChild(picture);
  } else {
    // Placeholder for missing image
    const placeholder = document.createElement('div');
    placeholder.className = 'user-overview-placeholder';
    placeholder.textContent = user.userFullname ? user.userFullname.charAt(0) : '?';
    imageDiv.appendChild(placeholder);
  }

  // User details
  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'user-overview-card-body';

  const name = document.createElement('h3');
  name.textContent = user.userFullname;
  bodyDiv.appendChild(name);

  const location = document.createElement('p');
  location.className = 'user-overview-location';
  const locationParts = [user.userCity, user.userCountry].filter(Boolean);
  location.textContent = locationParts.join(', ');
  bodyDiv.appendChild(location);

  if (user.userEmail) {
    const email = document.createElement('p');
    email.className = 'user-overview-email';
    email.textContent = user.userEmail;
    bodyDiv.appendChild(email);
  }

  // Link to user page
  if (user.path) {
    const link = document.createElement('a');
    link.href = user.path;
    link.className = 'button user-overview-link';
    link.textContent = 'View Profile';
    bodyDiv.appendChild(link);
  }

  li.appendChild(imageDiv);
  li.appendChild(bodyDiv);

  return li;
}

/**
 * Fetches and filters user data
 * @returns {Promise<Array>} - Array of valid user objects
 */
async function fetchUsers() {
  try {
    const response = await fetch(USER_INDEX_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Filter users with valid metadata
    const validUsers = data.data.filter(hasValidMetadata);
    
    return validUsers;
  } catch (error) {
    console.error('Error fetching user data:', error);
    return [];
  }
}

/**
 * Creates filter UI elements
 * @param {Array} users - Array of user objects
 * @param {Function} onFilter - Callback function when filter changes
 * @returns {HTMLElement} - Filter container element
 */
function createFilterUI(users, onFilter) {
  const filterContainer = document.createElement('div');
  filterContainer.className = 'user-overview-filters';

  // Search input
  const searchWrapper = document.createElement('div');
  searchWrapper.className = 'user-overview-search-wrapper';
  
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search by name...';
  searchInput.className = 'user-overview-search';
  searchInput.addEventListener('input', (e) => {
    onFilter({ search: e.target.value, country: countrySelect.value });
  });
  searchWrapper.appendChild(searchInput);

  // Country filter
  const countryWrapper = document.createElement('div');
  countryWrapper.className = 'user-overview-filter-wrapper';
  
  const countrySelect = document.createElement('select');
  countrySelect.className = 'user-overview-country-filter';
  
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'All Countries';
  countrySelect.appendChild(allOption);

  // Get unique countries
  const countries = [...new Set(users.map(u => u.userCountry))].sort();
  countries.forEach((country) => {
    const option = document.createElement('option');
    option.value = country;
    option.textContent = country;
    countrySelect.appendChild(option);
  });

  countrySelect.addEventListener('change', (e) => {
    onFilter({ search: searchInput.value, country: e.target.value });
  });
  countryWrapper.appendChild(countrySelect);

  filterContainer.appendChild(searchWrapper);
  filterContainer.appendChild(countryWrapper);

  return filterContainer;
}

/**
 * Filters users based on search and country criteria
 * @param {Array} users - Array of user objects
 * @param {Object} filters - Filter criteria
 * @returns {Array} - Filtered user array
 */
function filterUsers(users, filters) {
  let filtered = users;

  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(user => 
      user.userFullname.toLowerCase().includes(searchLower)
    );
  }

  if (filters.country) {
    filtered = filtered.filter(user => user.userCountry === filters.country);
  }

  return filtered;
}

/**
 * Decorates the user overview block
 * @param {HTMLElement} block - The block element
 */
export default async function decorate(block) {
  // Get headline from block content (if provided)
  const headline = block.querySelector('h1, h2, h3, h4, h5, h6')?.textContent || 'User Directory';
  
  // Clear any existing content
  block.innerHTML = '';

  // Add headline
  const headlineEl = document.createElement('h2');
  headlineEl.className = 'user-overview-headline';
  headlineEl.textContent = headline;
  block.appendChild(headlineEl);

  // Show loading state
  const loading = document.createElement('p');
  loading.className = 'user-overview-loading';
  loading.textContent = 'Loading users...';
  block.appendChild(loading);

  // Fetch users
  const allUsers = await fetchUsers();

  // Remove loading state
  loading.remove();

  if (allUsers.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'user-overview-empty';
    emptyState.textContent = 'No users found.';
    block.appendChild(emptyState);
    return;
  }

  // Create user grid container
  const gridContainer = document.createElement('div');
  gridContainer.className = 'user-overview-grid-container';

  // Create user grid
  const ul = document.createElement('ul');
  ul.className = 'user-overview-grid';

  // Function to render users
  const renderUsers = (users) => {
    ul.innerHTML = '';
    
    if (users.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'user-overview-empty';
      emptyState.textContent = 'No users match your filters.';
      ul.appendChild(emptyState);
      return;
    }

    users.forEach((user) => {
      const card = createUserCard(user);
      ul.appendChild(card);
    });
  };

  // Initial render
  renderUsers(allUsers);

  // Create and add filters
  const filterUI = createFilterUI(allUsers, (filters) => {
    const filtered = filterUsers(allUsers, filters);
    renderUsers(filtered);
  });

  block.appendChild(filterUI);
  block.appendChild(gridContainer);
  gridContainer.appendChild(ul);
}

