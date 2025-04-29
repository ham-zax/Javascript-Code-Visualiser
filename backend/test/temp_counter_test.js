function createCounter() {
  let count = 0; // Declaration
  return function() {
    count = count + 1; // Assignment
    return count;
  };
}
const counter = createCounter();
counter(); // First call, count becomes 1
counter(); // Second call, count becomes 2