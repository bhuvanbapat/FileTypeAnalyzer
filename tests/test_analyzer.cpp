// ============================================================================
// FileTypeAnalyzer Pro - Unit Tests
// Compile: g++ -std=c++17 -O2 tests/test_analyzer.cpp -o test_analyzer
// Run: ./test_analyzer
// ============================================================================

#include <cassert>
#include <cmath>
#include <cstring>
#include <filesystem>
#include <iostream>
#include <string>
#include <vector>

namespace fs = std::filesystem;
using namespace std;

// ============================================================================
// Test Counters
// ============================================================================
int testsRun = 0;
int testsPassed = 0;
int testsFailed = 0;

#define TEST(name) void test_##name()
#define RUN_TEST(name) runTest(#name, test_##name)

// ============================================================================
// Test Runner
// ============================================================================
void runTest(const string &name, void (*testFunc)()) {
  testsRun++;
  cout << "  Running: " << name << "... ";
  try {
    testFunc();
    testsPassed++;
    cout << "\033[32m✓ PASSED\033[0m\n";
  } catch (const exception &e) {
    testsFailed++;
    cout << "\033[31m✗ FAILED: " << e.what() << "\033[0m\n";
  } catch (...) {
    testsFailed++;
    cout << "\033[31m✗ FAILED: Unknown error\033[0m\n";
  }
}

// ============================================================================
// Utility Functions (copied from analyzer.cpp for testing)
// ============================================================================
string bytesToHex(const vector<unsigned char> &bytes) {
  string result;
  const char *hexChars = "0123456789ABCDEF";
  for (unsigned char byte : bytes) {
    result += hexChars[byte >> 4];
    result += hexChars[byte & 0x0F];
  }
  return result;
}

string formatSize(uintmax_t bytes) {
  const char *units[] = {"B", "KB", "MB", "GB", "TB"};
  int unitIndex = 0;
  double size = static_cast<double>(bytes);

  while (size >= 1024 && unitIndex < 4) {
    size /= 1024;
    unitIndex++;
  }

  char buffer[32];
  snprintf(buffer, sizeof(buffer), "%.2f %s", size, units[unitIndex]);
  return string(buffer);
}

string toLowercase(const string &str) {
  string result = str;
  for (char &c : result) {
    c = static_cast<char>(tolower(static_cast<unsigned char>(c)));
  }
  return result;
}

double calculateEntropy(const vector<unsigned char> &bytes) {
  if (bytes.empty())
    return 0.0;

  int freq[256] = {0};
  for (unsigned char b : bytes) {
    freq[b]++;
  }

  double entropy = 0.0;
  double len = static_cast<double>(bytes.size());

  for (int i = 0; i < 256; i++) {
    if (freq[i] > 0) {
      double p = freq[i] / len;
      entropy -= p * log2(p);
    }
  }

  return entropy;
}

// ============================================================================
// Test: bytesToHex Function
// ============================================================================
TEST(bytesToHex_empty) {
  vector<unsigned char> empty;
  assert(bytesToHex(empty) == "");
}

TEST(bytesToHex_single_byte) {
  vector<unsigned char> bytes = {0x89};
  assert(bytesToHex(bytes) == "89");
}

TEST(bytesToHex_png_signature) {
  vector<unsigned char> png = {0x89, 0x50, 0x4E, 0x47};
  assert(bytesToHex(png) == "89504E47");
}

TEST(bytesToHex_zeros) {
  vector<unsigned char> zeros = {0x00, 0x00, 0x00};
  assert(bytesToHex(zeros) == "000000");
}

TEST(bytesToHex_max_values) {
  vector<unsigned char> maxVals = {0xFF, 0xFF};
  assert(bytesToHex(maxVals) == "FFFF");
}

// ============================================================================
// Test: formatSize Function
// ============================================================================
TEST(formatSize_bytes) {
  string result = formatSize(500);
  assert(result.find("500") != string::npos);
  assert(result.find("B") != string::npos);
}

TEST(formatSize_kilobytes) {
  string result = formatSize(1024);
  assert(result.find("KB") != string::npos);
}

TEST(formatSize_megabytes) {
  string result = formatSize(1024 * 1024);
  assert(result.find("MB") != string::npos);
}

TEST(formatSize_gigabytes) {
  string result = formatSize(1024ULL * 1024 * 1024);
  assert(result.find("GB") != string::npos);
}

TEST(formatSize_zero) {
  string result = formatSize(0);
  assert(result.find("0") != string::npos);
}

// ============================================================================
// Test: toLowercase Function
// ============================================================================
TEST(toLowercase_uppercase) { assert(toLowercase("HELLO") == "hello"); }

TEST(toLowercase_mixed) { assert(toLowercase("HeLLo WoRLd") == "hello world"); }

TEST(toLowercase_already_lower) { assert(toLowercase("hello") == "hello"); }

TEST(toLowercase_empty) { assert(toLowercase("") == ""); }

TEST(toLowercase_numbers) { assert(toLowercase("Test123") == "test123"); }

// ============================================================================
// Test: calculateEntropy Function
// ============================================================================
TEST(entropy_empty) {
  vector<unsigned char> empty;
  assert(calculateEntropy(empty) == 0.0);
}

TEST(entropy_single_value) {
  vector<unsigned char> single(100, 0x00);
  double entropy = calculateEntropy(single);
  assert(entropy == 0.0); // All same values = 0 entropy
}

TEST(entropy_uniform) {
  vector<unsigned char> uniform;
  for (int i = 0; i < 256; i++) {
    uniform.push_back(static_cast<unsigned char>(i));
  }
  double entropy = calculateEntropy(uniform);
  assert(entropy > 7.9 && entropy <= 8.0); // Max entropy is 8 for 256 values
}

TEST(entropy_text_like) {
  // Simulate text-like data (mostly printable ASCII)
  vector<unsigned char> text;
  const char *sample = "Hello, this is a sample text with some variation!";
  for (size_t i = 0; i < strlen(sample); i++) {
    text.push_back(static_cast<unsigned char>(sample[i]));
  }
  double entropy = calculateEntropy(text);
  assert(entropy > 0 && entropy < 5); // Text typically has entropy 3-5
}

TEST(entropy_random_like) {
  // High entropy data simulation
  vector<unsigned char> random;
  srand(12345); // Consistent seed
  for (int i = 0; i < 1000; i++) {
    random.push_back(static_cast<unsigned char>(rand() % 256));
  }
  double entropy = calculateEntropy(random);
  assert(entropy > 7.0); // Random data should have high entropy
}

// ============================================================================
// Test: Magic Number Detection
// ============================================================================
TEST(magic_png_detection) {
  vector<unsigned char> png = {0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
  string hex = bytesToHex(png);
  assert(hex.substr(0, 8) == "89504E47");
}

TEST(magic_pdf_detection) {
  vector<unsigned char> pdf = {0x25, 0x50, 0x44, 0x46, 0x2D};
  string hex = bytesToHex(pdf);
  assert(hex.substr(0, 8) == "25504446");
}

TEST(magic_exe_detection) {
  vector<unsigned char> exe = {0x4D, 0x5A};
  string hex = bytesToHex(exe);
  assert(hex.substr(0, 4) == "4D5A");
}

TEST(magic_zip_detection) {
  vector<unsigned char> zip = {0x50, 0x4B, 0x03, 0x04};
  string hex = bytesToHex(zip);
  assert(hex.substr(0, 8) == "504B0304");
}

// ============================================================================
// Test: File Extension Matching
// ============================================================================
TEST(extension_extraction) {
  fs::path filePath = "test.png";
  string ext = toLowercase(filePath.extension().string());
  assert(ext == ".png");
}

TEST(extension_hidden_file) {
  fs::path filePath = ".gitignore";
  string ext = filePath.extension().string();
  // .gitignore has no extension, the whole thing is the filename
  assert(ext == "" || ext == ".gitignore");
}

TEST(extension_multiple_dots) {
  fs::path filePath = "file.tar.gz";
  string ext = toLowercase(filePath.extension().string());
  assert(ext == ".gz");
}

// ============================================================================
// Test: Edge Cases
// ============================================================================
TEST(edge_empty_vector) {
  vector<unsigned char> empty;
  assert(bytesToHex(empty).empty());
  assert(calculateEntropy(empty) == 0.0);
}

TEST(edge_large_file_size) {
  uintmax_t largeSize = 1099511627776ULL; // 1 TB
  string result = formatSize(largeSize);
  assert(result.find("TB") != string::npos);
}

// ============================================================================
// Main Test Runner
// ============================================================================
int main() {
  cout << "\n";
  cout << "\033["
          "36m╔══════════════════════════════════════════════════════════════╗"
          "\n";
  cout << "║            FileTypeAnalyzer Pro - Unit Tests                  ║\n";
  cout << "╚══════════════════════════════════════════════════════════════╝\033"
          "[0m\n\n";

  cout << "\033[33m── bytesToHex Tests ──\033[0m\n";
  RUN_TEST(bytesToHex_empty);
  RUN_TEST(bytesToHex_single_byte);
  RUN_TEST(bytesToHex_png_signature);
  RUN_TEST(bytesToHex_zeros);
  RUN_TEST(bytesToHex_max_values);

  cout << "\n\033[33m── formatSize Tests ──\033[0m\n";
  RUN_TEST(formatSize_bytes);
  RUN_TEST(formatSize_kilobytes);
  RUN_TEST(formatSize_megabytes);
  RUN_TEST(formatSize_gigabytes);
  RUN_TEST(formatSize_zero);

  cout << "\n\033[33m── toLowercase Tests ──\033[0m\n";
  RUN_TEST(toLowercase_uppercase);
  RUN_TEST(toLowercase_mixed);
  RUN_TEST(toLowercase_already_lower);
  RUN_TEST(toLowercase_empty);
  RUN_TEST(toLowercase_numbers);

  cout << "\n\033[33m── Entropy Tests ──\033[0m\n";
  RUN_TEST(entropy_empty);
  RUN_TEST(entropy_single_value);
  RUN_TEST(entropy_uniform);
  RUN_TEST(entropy_text_like);
  RUN_TEST(entropy_random_like);

  cout << "\n\033[33m── Magic Number Tests ──\033[0m\n";
  RUN_TEST(magic_png_detection);
  RUN_TEST(magic_pdf_detection);
  RUN_TEST(magic_exe_detection);
  RUN_TEST(magic_zip_detection);

  cout << "\n\033[33m── File Extension Tests ──\033[0m\n";
  RUN_TEST(extension_extraction);
  RUN_TEST(extension_hidden_file);
  RUN_TEST(extension_multiple_dots);

  cout << "\n\033[33m── Edge Case Tests ──\033[0m\n";
  RUN_TEST(edge_empty_vector);
  RUN_TEST(edge_large_file_size);

  // Summary
  cout << "\n";
  cout << "\033["
          "36m╔══════════════════════════════════════════════════════════════╗"
          "\n";
  cout << "║                        Test Summary                           ║\n";
  cout << "╠══════════════════════════════════════════════════════════════╣\n";
  cout << "║  Total Tests: " << testsRun
       << "                                            ║\n";
  cout << "║  \033[32mPassed: " << testsPassed
       << "\033[36m                                               ║\n";
  if (testsFailed > 0) {
    cout << "║  \033[31mFailed: " << testsFailed
         << "\033[36m                                                ║\n";
  } else {
    cout << "║  Failed: 0                                                ║\n";
  }
  cout << "╚══════════════════════════════════════════════════════════════╝\033"
          "[0m\n\n";

  if (testsFailed > 0) {
    cout << "\033[31m✗ Some tests failed!\033[0m\n";
    return 1;
  } else {
    cout << "\033[32m✓ All tests passed!\033[0m\n";
    return 0;
  }
}
