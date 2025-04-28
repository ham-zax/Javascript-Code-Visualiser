function test(a) {
  console.log("Param:", a); // Added label for clarity
  let x = 2;
  console.log("Local:", x); // Added label for clarity
}

console.log("Starting test...");
test(1);
console.log("Test finished.");