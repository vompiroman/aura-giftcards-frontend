window.addEventListener('error', function(e) {
  var root = document.getElementById('root');
  if (root && root.querySelector('.loading-screen')) {
    root.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:2rem;text-align:center;">'
      + '<p style="color:#e63946;font-size:1.3rem;margin-bottom:1rem;">Erreur de chargement</p>'
      + '<p style="color:#8a8690;">Veuillez verifier votre connexion internet et recharger la page.</p></div>';
  }
});
