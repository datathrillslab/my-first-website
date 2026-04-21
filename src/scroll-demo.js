import scrollama from 'scrollama';

const scroller = scrollama();

const steps = document.querySelectorAll('.step');
const svgs = document.querySelectorAll('.scroll-svg');

function handleStepEnter(response) {
  // mark the active step
  steps.forEach((step, i) => {
    step.classList.toggle('is-active', i === response.index);
  });

  // show the matching SVG, hide the rest
  svgs.forEach((svg, i) => {
    svg.classList.toggle('is-visible', i === response.index);
  });
}

scroller
  .setup({
    step: '.step',
    offset: 0.5,
  })
  .onStepEnter(handleStepEnter);

window.addEventListener('resize', scroller.resize);
