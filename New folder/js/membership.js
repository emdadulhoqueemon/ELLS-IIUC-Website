/**
 * ELLS Club - Membership Application Module
 * Multi-step wizard, interactive validation, word counter, and digital pass generation
 */

document.addEventListener('DOMContentLoaded', () => {
  initMembershipWizard();
  checkExistingMembership();
});

function initMembershipWizard() {
  const wizardForm = document.getElementById('membershipForm');
  if (!wizardForm) return;

  const steps = document.querySelectorAll('.wizard-step');
  const stepIndicators = document.querySelectorAll('.wizard-step-indicator');
  const prevBtn = document.getElementById('prevStepBtn');
  const nextBtn = document.getElementById('nextStepBtn');
  const submitBtn = document.getElementById('submitMembershipBtn');
  const statementInput = document.getElementById('statementOfPurpose');
  const wordCountDisplay = document.getElementById('wordCountDisplay');

  let currentStep = 1;
  const totalSteps = steps.length;

  // Tier selection handling
  const tierCards = document.querySelectorAll('.tier-card');
  const tierInput = document.getElementById('selectedTierInput');

  tierCards.forEach(card => {
    card.addEventListener('click', () => {
      tierCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const tierValue = card.getAttribute('data-tier');
      if (tierInput) tierInput.value = tierValue;
      updateReviewSummary();
    });
  });

  // Word Counter for Statement
  if (statementInput && wordCountDisplay) {
    statementInput.addEventListener('input', () => {
      const text = statementInput.value.trim();
      const words = text ? text.split(/\s+/).length : 0;
      wordCountDisplay.textContent = `${words} / 150 words`;
      if (words > 150) {
        wordCountDisplay.style.color = 'var(--accent-crimson)';
      } else {
        wordCountDisplay.style.color = 'var(--text-muted)';
      }
    });
  }

  // Navigation handlers
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (validateStep(currentStep)) {
        if (currentStep < totalSteps) {
          goToStep(currentStep + 1);
        }
      }
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentStep > 1) {
        goToStep(currentStep - 1);
      }
    });
  }

  function goToStep(stepNumber) {
    currentStep = stepNumber;

    // Update steps display
    steps.forEach(step => {
      step.classList.remove('active');
      if (parseInt(step.getAttribute('data-step')) === currentStep) {
        step.classList.add('active');
      }
    });

    // Update indicators
    stepIndicators.forEach(indicator => {
      const stepIdx = parseInt(indicator.getAttribute('data-step'));
      indicator.classList.remove('active', 'completed');
      if (stepIdx === currentStep) {
        indicator.classList.add('active');
      } else if (stepIdx < currentStep) {
        indicator.classList.add('completed');
      }
    });

    // Toggle navigation buttons
    if (prevBtn) {
      prevBtn.style.display = currentStep === 1 ? 'none' : 'inline-flex';
    }

    if (nextBtn && submitBtn) {
      if (currentStep === totalSteps) {
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'inline-flex';
        updateReviewSummary();
      } else {
        nextBtn.style.display = 'inline-flex';
        submitBtn.style.display = 'none';
      }
    }

    // Smooth scroll back to form top
    wizardForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Live Step Validation
  function validateStep(step) {
    let isValid = true;

    if (step === 1) {
      const fullName = document.getElementById('fullName');
      const email = document.getElementById('emailAddress');
      const phone = document.getElementById('phoneNumber');
      const affiliation = document.getElementById('affiliation');

      if (!fullName.value.trim()) {
        markError(fullName, 'Please provide your full legal or preferred name.');
        isValid = false;
      } else {
        clearError(fullName);
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email.value.trim() || !emailRegex.test(email.value.trim())) {
        markError(email, 'Please enter a valid academic or personal email address.');
        isValid = false;
      } else {
        clearError(email);
      }

      if (!phone.value.trim()) {
        markError(phone, 'Please provide a valid contact number.');
        isValid = false;
      } else {
        clearError(phone);
      }

      if (!affiliation.value.trim()) {
        markError(affiliation, 'Please enter your department, major, or institution.');
        isValid = false;
      } else {
        clearError(affiliation);
      }
    }

    if (step === 2) {
      const interests = document.querySelectorAll('input[name="literaryInterests"]:checked');
      const errorBox = document.getElementById('interestsError');
      if (interests.length === 0) {
        if (errorBox) {
          errorBox.textContent = 'Please select at least one literary or linguistic area of interest.';
          errorBox.style.display = 'block';
        }
        isValid = false;
      } else {
        if (errorBox) errorBox.style.display = 'none';
      }
    }

    if (step === 3) {
      const statement = document.getElementById('statementOfPurpose');
      if (!statement.value.trim() || statement.value.trim().split(/\s+/).length < 15) {
        markError(statement, 'Please share at least a few sentences (minimum 15 words) describing your literary interests.');
        isValid = false;
      } else {
        clearError(statement);
      }
    }

    if (!isValid) {
      showToast('Please complete all required fields correctly before proceeding.', 'error');
    }

    return isValid;
  }

  function markError(input, message) {
    const parent = input.closest('.form-group');
    if (parent) {
      parent.classList.add('has-error');
      let errorEl = parent.querySelector('.form-error');
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
      }
    }
  }

  function clearError(input) {
    const parent = input.closest('.form-group');
    if (parent) {
      parent.classList.remove('has-error');
      let errorEl = parent.querySelector('.form-error');
      if (errorEl) {
        errorEl.style.display = 'none';
      }
    }
  }

  // Update Review Screen
  function updateReviewSummary() {
    const name = document.getElementById('fullName')?.value || 'Distinguished Scholar';
    const email = document.getElementById('emailAddress')?.value || '';
    const affiliation = document.getElementById('affiliation')?.value || '';
    const tier = document.getElementById('selectedTierInput')?.value || 'Student Fellow';

    const selectedInterests = Array.from(document.querySelectorAll('input[name="literaryInterests"]:checked'))
      .map(cb => cb.parentElement.textContent.trim())
      .join(', ') || 'Literary Arts & English Language';

    const reviewName = document.getElementById('reviewName');
    const reviewEmail = document.getElementById('reviewEmail');
    const reviewAffiliation = document.getElementById('reviewAffiliation');
    const reviewInterests = document.getElementById('reviewInterests');
    const reviewTier = document.getElementById('reviewTier');

    if (reviewName) reviewName.textContent = name;
    if (reviewEmail) reviewEmail.textContent = email;
    if (reviewAffiliation) reviewAffiliation.textContent = affiliation;
    if (reviewInterests) reviewInterests.textContent = selectedInterests;
    if (reviewTier) reviewTier.textContent = tier.toUpperCase();
  }

  // Form Submission
  wizardForm.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
      goToStep(1);
      return;
    }

    const agreeCode = document.getElementById('agreeCodeOfConduct');
    if (agreeCode && !agreeCode.checked) {
      showToast('You must agree to the ELLS Club Code of Intellectual Discourse.', 'error');
      return;
    }

    // Simulate submission processing
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>Processing Application...</span>`;
    }

    setTimeout(() => {
      const fullName = document.getElementById('fullName')?.value.trim() || 'New Fellow';
      const tier = document.getElementById('selectedTierInput')?.value || 'Student Fellow';
      const memberId = 'ELLS-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
      const issueDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      const memberData = {
        name: fullName,
        id: memberId,
        tier: tier,
        issued: issueDate
      };

      localStorage.setItem('ells-member', JSON.stringify(memberData));
      renderMembershipPass(memberData);

      showToast(`Welcome to ELLS Club, ${fullName}! Your fellowship is confirmed.`, 'success');
    }, 900);
  });
}

function renderMembershipPass(memberData) {
  const formCard = document.getElementById('applicationFormCard');
  const passContainer = document.getElementById('membershipPassContainer');

  if (formCard) formCard.style.display = 'none';
  if (passContainer) {
    passContainer.style.display = 'block';

    const passName = document.getElementById('passMemberName');
    const passId = document.getElementById('passMemberId');
    const passTier = document.getElementById('passTier');
    const passDate = document.getElementById('passIssuedDate');

    if (passName) passName.textContent = memberData.name;
    if (passId) passId.textContent = memberData.id;
    if (passTier) passTier.textContent = memberData.tier.toUpperCase();
    if (passDate) passDate.textContent = memberData.issued;

    // Scroll smoothly to the pass
    passContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Print button
  const printBtn = document.getElementById('printPassBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }

  // Reset/Reapply button
  const reapplyBtn = document.getElementById('reapplyBtn');
  if (reapplyBtn) {
    reapplyBtn.addEventListener('click', () => {
      localStorage.removeItem('ells-member');
      location.reload();
    });
  }
}

function checkExistingMembership() {
  const savedMember = localStorage.getItem('ells-member');
  if (savedMember) {
    try {
      const memberData = JSON.parse(savedMember);
      const viewExistingBtn = document.getElementById('viewExistingMemberNotice');
      if (viewExistingBtn) {
        viewExistingBtn.style.display = 'block';
        viewExistingBtn.innerHTML = `
          <div style="background: var(--accent-gold-light); border: 1px solid var(--accent-gold); padding: 1rem; border-radius: var(--radius-sm); margin-bottom: 2rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
            <div>
              <strong>Active Fellowship Found:</strong> You are registered as <em>${memberData.name}</em> (${memberData.id}).
            </div>
            <button type="button" class="btn btn-sm btn-primary" id="restorePassBtn">View Digital Pass</button>
          </div>
        `;
        document.getElementById('restorePassBtn')?.addEventListener('click', () => {
          renderMembershipPass(memberData);
        });
      }
    } catch (e) {
      console.error(e);
    }
  }
}
