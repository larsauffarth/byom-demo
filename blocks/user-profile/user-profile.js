export default function decorate(block) {
  // The block structure is already created by the template
  // This function can be used for any additional client-side enhancements

  // Add CSS classes for better styling
  const container = block.querySelector('.user-profile > div > div');
  if (container) {
    // Find the profile picture, name, and username elements
    const picture = container.querySelector('p:first-child');
    const name = container.querySelector('h2');
    const username = container.querySelector('p:nth-child(3)');

    if (picture) picture.classList.add('profile-picture');
    if (name) name.classList.add('profile-name');
    if (username) username.classList.add('profile-username');

    // Group detail sections
    const headings = container.querySelectorAll('h3');
    const detailsWrapper = document.createElement('div');
    detailsWrapper.classList.add('profile-details');
    container.appendChild(detailsWrapper);

    headings.forEach((heading, index) => {
      const sectionDiv = document.createElement('div');
      sectionDiv.classList.add('detail-section');
      detailsWrapper.appendChild(sectionDiv);

      // Move heading and following p elements until next h3
      sectionDiv.appendChild(heading);
      let nextElement = heading.nextElementSibling;
      while (nextElement && nextElement.tagName !== 'H3') {
        const current = nextElement;
        nextElement = nextElement.nextElementSibling;
        sectionDiv.appendChild(current);
      }
    });
  }

  // Add animation on load
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '0';
        entry.target.style.transform = 'translateY(20px)';
        entry.target.style.transition = 'opacity 0.6s ease, transform 0.6s ease';

        setTimeout(() => {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }, 100);

        observer.unobserve(entry.target);
      }
    });
  });

  observer.observe(block);
}

