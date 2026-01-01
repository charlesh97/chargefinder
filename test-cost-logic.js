// Test script to verify the cost/free logic fix
// Simulates the Tesla Supercharger data from the API

// Copy of the logic from parseChargerData for testing
function testParseChargerData(charger) {
  const usageCost = charger.UsageCost || '';
  const isPayAtLocation = charger.UsageType?.IsPayAtLocation ?? false;
  
  // Determine if charger is free:
  // 1. If UsageCost explicitly contains "free", it's free
  // 2. If UsageCost is null/empty, check IsPayAtLocation:
  //    - If IsPayAtLocation is true, it's NOT free (paid)
  //    - If IsPayAtLocation is false/null, default to not free (safer assumption)
  // 3. If UsageCost has a value (and doesn't contain "free"), it's paid
  const isFree =
    usageCost !== null &&
    usageCost !== '' &&
    typeof usageCost === 'string' &&
    usageCost.toLowerCase().includes('free') &&
    !isPayAtLocation; // Explicitly free AND not pay-at-location

  const cost = usageCost && usageCost !== '' 
    ? usageCost 
    : (isFree ? 'Free' : (isPayAtLocation ? 'Pay At Location' : 'Paid'));

  return { isFree, cost, isPayAtLocation };
}

// Simulate the Tesla Supercharger data based on the API response
// Usage: "Public - Pay At Location"
const teslaSuperchargerData = {
  UsageCost: null, // This is null/empty in the API
  UsageType: {
    Title: 'Public - Pay At Location',
    IsPayAtLocation: true, // This is the key indicator
  },
};

console.log('Testing Tesla Supercharger with Pay At Location...\n');

const result = testParseChargerData(teslaSuperchargerData);

console.log('Test data:');
console.log('  UsageCost:', teslaSuperchargerData.UsageCost);
console.log('  IsPayAtLocation:', teslaSuperchargerData.UsageType.IsPayAtLocation);
console.log('\nResults:');
console.log('  isFree:', result.isFree);
console.log('  cost:', result.cost);
console.log('\nExpected: isFree=false, cost="Pay At Location" or "Paid"');
console.log('Actual:   isFree=' + result.isFree + ', cost="' + result.cost + '"');

if (result.isFree === false && (result.cost === 'Pay At Location' || result.cost === 'Paid')) {
  console.log('\n✅ TEST PASSED: Charger correctly identified as NOT free');
} else {
  console.log('\n❌ TEST FAILED: Charger incorrectly identified');
  process.exit(1);
}

// Test case 2: Actually free charger
const freeChargerData = {
  UsageCost: 'Free',
  UsageType: {
    IsPayAtLocation: false,
  },
};

console.log('\n\nTesting actually free charger...\n');
const resultFree = testParseChargerData(freeChargerData);
console.log('Test data:');
console.log('  UsageCost:', freeChargerData.UsageCost);
console.log('  IsPayAtLocation:', freeChargerData.UsageType.IsPayAtLocation);
console.log('\nResults:');
console.log('  isFree:', resultFree.isFree);
console.log('  cost:', resultFree.cost);
console.log('\nExpected: isFree=true, cost="Free"');
console.log('Actual:   isFree=' + resultFree.isFree + ', cost="' + resultFree.cost + '"');

if (resultFree.isFree === true && resultFree.cost === 'Free') {
  console.log('\n✅ TEST PASSED: Free charger correctly identified');
} else {
  console.log('\n❌ TEST FAILED: Free charger incorrectly identified');
  process.exit(1);
}

// Test case 3: Charger with cost info but not pay-at-location
const paidChargerData = {
  UsageCost: '$0.35/kWh',
  UsageType: {
    IsPayAtLocation: false,
  },
};

console.log('\n\nTesting charger with explicit cost...\n');
const resultPaid = testParseChargerData(paidChargerData);
console.log('Test data:');
console.log('  UsageCost:', paidChargerData.UsageCost);
console.log('  IsPayAtLocation:', paidChargerData.UsageType.IsPayAtLocation);
console.log('\nResults:');
console.log('  isFree:', resultPaid.isFree);
console.log('  cost:', resultPaid.cost);
console.log('\nExpected: isFree=false, cost="$0.35/kWh"');
console.log('Actual:   isFree=' + resultPaid.isFree + ', cost="' + resultPaid.cost + '"');

if (resultPaid.isFree === false && resultPaid.cost === '$0.35/kWh') {
  console.log('\n✅ TEST PASSED: Charger with explicit cost correctly identified');
} else {
  console.log('\n❌ TEST FAILED: Charger with explicit cost incorrectly identified');
  process.exit(1);
}

// Test case 4: Empty UsageCost but IsPayAtLocation = true (the bug case)
const bugCaseData = {
  UsageCost: '', // Empty string
  UsageType: {
    IsPayAtLocation: true,
  },
};

console.log('\n\nTesting bug case: empty UsageCost but IsPayAtLocation=true...\n');
const resultBug = testParseChargerData(bugCaseData);
console.log('Test data:');
console.log('  UsageCost:', '"" (empty string)');
console.log('  IsPayAtLocation:', bugCaseData.UsageType.IsPayAtLocation);
console.log('\nResults:');
console.log('  isFree:', resultBug.isFree);
console.log('  cost:', resultBug.cost);
console.log('\nExpected: isFree=false, cost="Pay At Location" or "Paid"');
console.log('Actual:   isFree=' + resultBug.isFree + ', cost="' + resultBug.cost + '"');

if (resultBug.isFree === false && (resultBug.cost === 'Pay At Location' || resultBug.cost === 'Paid')) {
  console.log('\n✅ TEST PASSED: Bug case correctly handled');
} else {
  console.log('\n❌ TEST FAILED: Bug case not fixed');
  process.exit(1);
}

console.log('\n\n✅ All tests passed!');
