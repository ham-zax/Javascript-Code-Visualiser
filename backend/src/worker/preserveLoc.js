// preserveLoc.js
module.exports = function preserveLoc() {
  return {
    visitor: {
      Program(path) {
        path.traverse({
          enter(p) {
            if (p.node && p.node.loc) {
              // stash away the original location 
              p.node.__origLoc = p.node.loc;
            }
          }
        });
      }
    }
  };
};