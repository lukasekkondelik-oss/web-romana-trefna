document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("year").textContent = new Date().getFullYear();

  /* ---------- Mobile nav ---------- */
  const navToggle = document.getElementById("navToggle");
  const mainNav = document.getElementById("mainNav");
  if (navToggle && mainNav) {
    navToggle.addEventListener("click", () => {
      const open = mainNav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    mainNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        mainNav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll(".faq-item").forEach((item) => {
    const q = item.querySelector(".faq-item__q");
    const a = item.querySelector(".faq-item__a");
    q.addEventListener("click", () => {
      const isOpen = item.classList.contains("is-open");
      document.querySelectorAll(".faq-item.is-open").forEach((openItem) => {
        if (openItem !== item) {
          openItem.classList.remove("is-open");
          openItem.querySelector(".faq-item__a").style.maxHeight = null;
          openItem.querySelector(".faq-item__q").setAttribute("aria-expanded", "false");
        }
      });
      if (isOpen) {
        item.classList.remove("is-open");
        a.style.maxHeight = null;
        q.setAttribute("aria-expanded", "false");
      } else {
        item.classList.add("is-open");
        a.style.maxHeight = a.scrollHeight + "px";
        q.setAttribute("aria-expanded", "true");
      }
    });
  });

  /* ---------- Testimonial carousel ---------- */
  const testimonials = [
    {
      quote: "„Paní Trefná bezproblémově zajistila veškeré služby (včetně právních konzultací a přípravy všech potřebných dokladů) při trochu problémovém prodeji částí lesa, takže celá transakce proběhla hladce a pro mne naprosto bez starostí. Moc děkuji.“",
      cite: "— Ing. Petr Kusebauch · Prodej pozemku",
    },
    {
      quote: "„Realitní kancelář Romana Reality mi nabídla při prodeji mých několika pozemků ve Vimperku kvalifikovaný, spolehlivý odhad s možností prodeje, trpělivost, výbornou komunikaci, bezproblémovou spolupráci a naprosto profesionální přístup s nadstandardním lidským přístupem.“",
      cite: "— Zdena P. · Prodej pozemků",
    },
    {
      quote: "„Paní Trefnou jednoznačně doporučuji! Můžete očekávat profesionální a současně milý a vstřícný přístup. Prodej bytu proběhl ukázkově. Dokumenty měla vždy precizně připravené a jednala se mnou na rovinu. Je to realitní makléřka na správném místě.“",
      cite: "— Kateřina Z. · Prodej bytu",
    },
    {
      quote: "„Překvapil mě její profesionální přístup se smyslem pro obchod. Hned na počátku měla z mé strany několik zadání, která bezchybně splnila. Vzhledem k jejím schopnostem vřele doporučuji.“",
      cite: "— Jana K. · Prodej rodinného domu",
    },
    {
      quote: "„Paní Romana Trefná prodávala můj pozemek – stavební parcelu v obci Kly u Mělníka. Sjednala mi velmi dobrou cenu v krátkém čase, zajistila uzavření smlouvy a vyřídila veškeré potřebné náležitosti. Její přístup byl profesionální.“",
      cite: "— Hana K. · Prodej pozemku",
    },
    {
      quote: "„Profesionální přístup a schopnost řešit neočekávané problémy. Vždy zachovala chladnou hlavu a byla perfektně připravená. Po této zkušenosti už zůstane mým makléřem.“",
      cite: "— Marco P. · Prodej restaurace",
    },
  ];

  let testimonialIndex = 0;
  const testimonialQuote = document.getElementById("testimonialQuote");
  const testimonialCite = document.getElementById("testimonialCite");
  const testimonialCounter = document.getElementById("testimonialCounter");

  function renderTestimonial() {
    const t = testimonials[testimonialIndex];
    testimonialQuote.textContent = t.quote;
    testimonialCite.textContent = t.cite;
    testimonialCounter.textContent = `${testimonialIndex + 1} / ${testimonials.length}`;
  }

  document.getElementById("testimonialPrev")?.addEventListener("click", () => {
    testimonialIndex = (testimonialIndex - 1 + testimonials.length) % testimonials.length;
    renderTestimonial();
  });
  document.getElementById("testimonialNext")?.addEventListener("click", () => {
    testimonialIndex = (testimonialIndex + 1) % testimonials.length;
    renderTestimonial();
  });

  /* ---------- Valuation wizard ---------- */
  const wizard = document.getElementById("valuationWizard");
  if (wizard) {
    const steps = Array.from(wizard.querySelectorAll(".wizard__step"));
    const totalSteps = steps.length - 1; // exclude success step
    const stepLabel = document.getElementById("wizardStepLabel");
    const stepName = document.getElementById("wizardStepName");
    const progressBar = document.getElementById("wizardProgressBar");
    const backBtn = document.getElementById("wizardBack");
    const nextBtn = document.getElementById("wizardNext");
    const wizardNav = wizard.querySelector(".wizard__nav");
    const wizardHead = wizard.querySelector(".wizard__head");
    const wizardProgress = wizard.querySelector(".wizard__progress");

    const stepNames = {
      1: "Typ nemovitosti",
      2: "Lokalita",
      3: "Parametry",
      4: "Účel",
      5: "Kontakt",
    };

    const paramsQuestions = {
      byt: "Jaké jsou parametry bytu?",
      dum: "Jaké jsou parametry domu?",
      pozemek: "Jaké jsou parametry pozemku?",
      ostatni: "Jaké jsou parametry nemovitosti?",
    };

    const typeToParams = {
      Byt: "byt",
      "Rodinný dům": "dum",
      Pozemek: "pozemek",
      "Rekreační objekt": "ostatni",
      "Komerční nemovitost": "ostatni",
      "Jiná nemovitost": "ostatni",
    };

    const answers = { typ: "", cil: "" };
    let current = 1;

    function updateParamsVisibility() {
      const key = typeToParams[answers.typ] || "byt";
      wizard.querySelectorAll(".wizard__params").forEach((group) => {
        group.classList.toggle("is-active", group.dataset.params === key);
      });
      const question = wizard.querySelector("#wizardParamsQuestion");
      if (question) question.textContent = paramsQuestions[key];
    }

    function showStep(n) {
      steps.forEach((s) => s.classList.remove("is-active"));
      wizard.querySelector(`[data-step="${n}"]`).classList.add("is-active");
      if (n === "success") {
        wizardNav.style.display = "none";
        wizardHead.style.display = "none";
        wizardProgress.style.display = "none";
        return;
      }
      if (n === 3) updateParamsVisibility();
      stepLabel.textContent = `Krok ${n} / ${totalSteps}`;
      stepName.textContent = stepNames[n];
      progressBar.style.width = `${(n / totalSteps) * 100}%`;
      backBtn.style.visibility = n === 1 ? "hidden" : "visible";
      if (n === totalSteps) {
        nextBtn.innerHTML = 'Odeslat poptávku <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
      } else {
        nextBtn.innerHTML = 'Pokračovat <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
      }
    }

    wizard.querySelectorAll(".wizard__options").forEach((group) => {
      const key = group.dataset.group;
      group.querySelectorAll(".option-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          group.querySelectorAll(".option-btn").forEach((b) => b.classList.remove("is-selected"));
          btn.classList.add("is-selected");
          answers[key] = btn.textContent.trim();
          if (key === "typ") updateParamsVisibility();
        });
      });
    });

    backBtn.addEventListener("click", () => {
      if (current > 1) {
        current -= 1;
        showStep(current);
      }
    });

    function fieldValue(id) {
      const el = wizard.querySelector(id);
      return el && el.value ? el.value : "neuvedeno";
    }

    function buildParamsFields() {
      const key = typeToParams[answers.typ] || "byt";
      if (key === "byt") {
        return {
          Dispozice: fieldValue("#wBytDispozice"),
          "Užitná plocha": `${fieldValue("#wBytPlocha")} m²`,
          Vlastnictví: fieldValue("#wBytVlastnictvi"),
          Stavba: fieldValue("#wBytStavba"),
          Patro: fieldValue("#wBytPatro"),
        };
      }
      if (key === "dum") {
        return {
          Velikost: fieldValue("#wDumVelikost"),
          "Užitná plocha": `${fieldValue("#wDumPlocha")} m²`,
          "Plocha pozemku": `${fieldValue("#wDumPozemek")} m²`,
        };
      }
      if (key === "pozemek") {
        return {
          "Druh pozemku": fieldValue("#wPozemekDruh"),
          "Plocha pozemku": `${fieldValue("#wPozemekPlocha")} m²`,
        };
      }
      return {
        "Užitná plocha": `${fieldValue("#wOstatniPlocha")} m²`,
        "Plocha pozemku": `${fieldValue("#wOstatniPozemek")} m²`,
      };
    }

    const successTitle = wizard.querySelector('[data-step="success"] h3');
    const successText = wizard.querySelector('[data-step="success"] p');

    function showSubmitError() {
      successTitle.textContent = "Poptávku se nepodařilo odeslat automaticky.";
      successText.innerHTML =
        'Napište mi prosím přímo na <a href="mailto:romana@romanareality.cz">romana@romanareality.cz</a> nebo zavolejte na <a href="tel:+420720347693">+420 720 347 693</a>.';
      showStep("success");
    }

    nextBtn.addEventListener("click", async () => {
      if (current < totalSteps) {
        current += 1;
        showStep(current);
        return;
      }

      const payload = {
        _subject: "Poptávka: orientační ocenění nemovitosti",
        Jméno: fieldValue("#wName"),
        Telefon: fieldValue("#wPhone"),
        "E-mail": fieldValue("#wEmail"),
        "Typ nemovitosti": answers.typ || "neuvedeno",
        Lokalita: fieldValue("#wLocation"),
        ...buildParamsFields(),
        Cíl: answers.cil || "neuvedeno",
      };

      nextBtn.disabled = true;
      nextBtn.innerHTML = "Odesílám…";

      try {
        const response = await fetch("https://formsubmit.co/ajax/romana@romanareality.cz", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("Odeslání se nezdařilo");
        showStep("success");
      } catch (err) {
        showSubmitError();
      } finally {
        nextBtn.disabled = false;
      }
    });

    showStep(1);
  }

  /* ---------- Cookie banner ---------- */
  const cookieBanner = document.getElementById("cookieBanner");
  const cookieKey = "romanareality_cookie_choice";

  function openCookieBanner() {
    if (cookieBanner) cookieBanner.hidden = false;
  }

  if (!localStorage.getItem(cookieKey)) {
    openCookieBanner();
  }

  document.getElementById("cookieAccept")?.addEventListener("click", () => {
    localStorage.setItem(cookieKey, "accepted");
    cookieBanner.hidden = true;
  });
  document.getElementById("cookieDecline")?.addEventListener("click", () => {
    localStorage.setItem(cookieKey, "essential-only");
    cookieBanner.hidden = true;
  });
  document.getElementById("cookieSettingsBtn")?.addEventListener("click", openCookieBanner);
});
