#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <future>
#include <iomanip>
#include <iostream>
#include <map>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#endif

namespace fs = std::filesystem;
using namespace std;
using namespace chrono;

// ============================================================================
// ANSI Color Codes for Terminal Output
// ============================================================================
const string RESET = "\033[0m";
const string BOLD = "\033[1m";
const string RED = "\033[1;31m";
const string GREEN = "\033[1;32m";
const string YELLOW = "\033[1;33m";
const string BLUE = "\033[1;34m";
const string CYAN = "\033[1;36m";
const string MAGENTA = "\033[1;35m";

#ifdef _WIN32
void enableVirtualTerminal() {
  HANDLE hOut = GetStdHandle(STD_OUTPUT_HANDLE);
  if (hOut != INVALID_HANDLE_VALUE) {
    DWORD dwMode = 0;
    if (GetConsoleMode(hOut, &dwMode)) {
      SetConsoleMode(hOut, dwMode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
    }
  }
}
#else
void enableVirtualTerminal() {}
#endif

// ============================================================================
// Thread-safe progress tracking
// ============================================================================
class ProgressTracker {
private:
  mutex mtx;
  size_t current = 0;
  size_t total = 0;
  string currentFile;

public:
  void setTotal(size_t t) {
    lock_guard<mutex> lock(mtx);
    total = t;
  }

  void update(const string &fileName) {
    lock_guard<mutex> lock(mtx);
    current++;
    currentFile = fileName;
  }

  tuple<size_t, size_t, string> getProgress() {
    lock_guard<mutex> lock(mtx);
    return {current, total, currentFile};
  }
};

// ============================================================================
// Extended Magic Number Database (50+ file types)
// ============================================================================
struct MagicSignature {
  string hex;
  string type;
  string category;
  string description;
  vector<string> extensions;
};

vector<MagicSignature> magicDatabase = {
    // Images
    {"89504E47", "PNG", "Image", "Portable Network Graphics", {".png"}},
    {"FFD8FFE0", "JPEG", "Image", "JPEG Image (JFIF)", {".jpg", ".jpeg"}},
    {"FFD8FFE1", "JPEG", "Image", "JPEG Image (EXIF)", {".jpg", ".jpeg"}},
    {"FFD8FFDB", "JPEG", "Image", "JPEG Image", {".jpg", ".jpeg"}},
    {"47494638", "GIF", "Image", "Graphics Interchange Format", {".gif"}},
    {"424D", "BMP", "Image", "Bitmap Image", {".bmp"}},
    {"38425053", "PSD", "Image", "Adobe Photoshop Document", {".psd"}},
    {"49492A00",
     "TIFF",
     "Image",
     "Tagged Image File Format (LE)",
     {".tiff", ".tif"}},
    {"4D4D002A",
     "TIFF",
     "Image",
     "Tagged Image File Format (BE)",
     {".tiff", ".tif"}},
    {"00000100", "ICO", "Image", "Windows Icon", {".ico"}},
    {"00000200", "CUR", "Image", "Windows Cursor", {".cur"}},

    // Documents
    {"25504446", "PDF", "Document", "Portable Document Format", {".pdf"}},
    {"D0CF11E0A1B11AE1",
     "DOC/XLS/PPT",
     "Document",
     "Microsoft Office Legacy",
     {".doc", ".xls", ".ppt"}},
    {"504B0304",
     "ZIP/DOCX/XLSX",
     "Archive",
     "ZIP Archive or Office Open XML",
     {".zip", ".docx", ".xlsx", ".pptx", ".jar", ".apk"}},
    {"504B0506", "ZIP", "Archive", "ZIP Archive (empty)", {".zip"}},
    {"504B0708", "ZIP", "Archive", "ZIP Archive (spanned)", {".zip"}},
    {"7B5C727466", "RTF", "Document", "Rich Text Format", {".rtf"}},

    // Archives
    {"52617221", "RAR", "Archive", "RAR Archive", {".rar"}},
    {"377ABCAF271C", "7Z", "Archive", "7-Zip Archive", {".7z"}},
    {"1F8B", "GZIP", "Archive", "GZIP Compressed", {".gz", ".gzip"}},
    {"425A68", "BZ2", "Archive", "BZIP2 Compressed", {".bz2"}},
    {"FD377A585A00", "XZ", "Archive", "XZ Compressed", {".xz"}},
    {"504B", "ZIP", "Archive", "ZIP Archive", {".zip"}},
    {"1F9D", "Z", "Archive", "LZW Compressed", {".z"}},
    {"1FA0", "Z", "Archive", "LZH Compressed", {".z"}},

    // Audio
    {"494433", "MP3", "Audio", "MP3 Audio (ID3)", {".mp3"}},
    {"FFFB", "MP3", "Audio", "MP3 Audio", {".mp3"}},
    {"FFF3", "MP3", "Audio", "MP3 Audio", {".mp3"}},
    {"FFF2", "MP3", "Audio", "MP3 Audio", {".mp3"}},
    {"664C6143", "FLAC", "Audio", "Free Lossless Audio Codec", {".flac"}},
    {"4F676753", "OGG", "Audio", "OGG Vorbis", {".ogg"}},

    // Video
    {"1A45DFA3", "MKV/WEBM", "Video", "Matroska/WebM Video", {".mkv", ".webm"}},
    {"464C56", "FLV", "Video", "Flash Video", {".flv"}},
    {"000001BA", "MPEG", "Video", "MPEG Video", {".mpg", ".mpeg"}},
    {"000001B3", "MPEG", "Video", "MPEG Video", {".mpg", ".mpeg"}},
    {"30264032", "WMV", "Video", "Windows Media Video", {".wmv"}},

    // Executables
    {"4D5A",
     "EXE/DLL",
     "Executable",
     "Windows Executable",
     {".exe", ".dll", ".sys"}},
    {"7F454C46", "ELF", "Executable", "Linux Executable", {}},
    {"CAFEBABE",
     "CLASS/MACH-O",
     "Executable",
     "Java Class or macOS",
     {".class"}},
    {"FEEDFACE", "MACH-O", "Executable", "macOS Executable (32-bit)", {}},
    {"FEEDFACF", "MACH-O", "Executable", "macOS Executable (64-bit)", {}},
    {"DEX0A", "DEX", "Executable", "Android Dalvik Executable", {".dex"}},

    // Database
    {"53514C697465",
     "SQLITE",
     "Database",
     "SQLite Database",
     {".db", ".sqlite", ".sqlite3"}},

    // Web/Code
    {"3C3F786D6C", "XML", "Data", "XML Document", {".xml"}},
    {"3C21444F43545950", "HTML", "Web", "HTML Document", {".html", ".htm"}},
    {"3C68746D6C", "HTML", "Web", "HTML Document", {".html", ".htm"}},
    {"7B", "JSON", "Data", "JSON Data (probable)", {".json"}},
    {"EFBBBF", "UTF8-BOM", "Text", "UTF-8 with BOM", {".txt"}},
    {"FFFE", "UTF16-LE", "Text", "UTF-16 Little Endian", {".txt"}},
    {"FEFF", "UTF16-BE", "Text", "UTF-16 Big Endian", {".txt"}},

    // Fonts
    {"00010000", "TTF", "Font", "TrueType Font", {".ttf"}},
    {"4F54544F", "OTF", "Font", "OpenType Font", {".otf"}},
    {"774F4646", "WOFF", "Font", "Web Open Font Format", {".woff"}},
    {"774F4632", "WOFF2", "Font", "Web Open Font Format 2", {".woff2"}},

    // Other
    {"25215053", "PS", "Document", "PostScript", {".ps", ".eps"}},
    {"4344303031", "ISO", "Disk", "ISO Disk Image", {".iso"}},
};

// ============================================================================
// Custom Signature Loading from JSON
// ============================================================================
bool loadCustomSignatures(const string &jsonPath) {
  ifstream file(jsonPath);
  if (!file)
    return false;

  // Simple JSON parsing (for custom signatures)
  string content((istreambuf_iterator<char>(file)),
                 istreambuf_iterator<char>());

  // Parse JSON-like format: [{"hex": "...", "type": "...", "category": "...",
  // "description": "..."}]
  size_t pos = 0;
  int loaded = 0;

  while ((pos = content.find("\"hex\"", pos)) != string::npos) {
    MagicSignature sig;

    // Extract hex
    size_t start = content.find(":", pos) + 1;
    size_t end = content.find("\"", content.find("\"", start) + 1);
    start = content.find("\"", start) + 1;
    sig.hex = content.substr(start, end - start);

    // Extract type
    pos = content.find("\"type\"", end);
    if (pos == string::npos)
      break;
    start = content.find(":", pos) + 1;
    end = content.find("\"", content.find("\"", start) + 1);
    start = content.find("\"", start) + 1;
    sig.type = content.substr(start, end - start);

    // Extract category
    pos = content.find("\"category\"", end);
    if (pos == string::npos)
      break;
    start = content.find(":", pos) + 1;
    end = content.find("\"", content.find("\"", start) + 1);
    start = content.find("\"", start) + 1;
    sig.category = content.substr(start, end - start);

    // Extract description
    pos = content.find("\"description\"", end);
    if (pos == string::npos)
      break;
    start = content.find(":", pos) + 1;
    end = content.find("\"", content.find("\"", start) + 1);
    start = content.find("\"", start) + 1;
    sig.description = content.substr(start, end - start);

    magicDatabase.push_back(sig);
    loaded++;
    pos = end;
  }

  return loaded > 0;
}

// ============================================================================
// File Info Structure
// ============================================================================
struct FileInfo {
  string path;
  string name;
  string type;
  string category;
  string description;
  uintmax_t size;
  bool isCorrupt;
  bool extensionMismatch;
  string detectedExtension;
  string actualExtension;
  double analysisTime;
  double entropy;
  string hash;
};

// ============================================================================
// Utility Functions
// ============================================================================
string bytesToHex(const vector<unsigned char> &bytes) {
  stringstream ss;
  ss << hex << uppercase;
  for (unsigned char byte : bytes) {
    ss << setw(2) << setfill('0') << static_cast<int>(byte);
  }
  return ss.str();
}

string formatSize(uintmax_t bytes) {
  const char *units[] = {"B", "KB", "MB", "GB", "TB"};
  int unitIndex = 0;
  double size = static_cast<double>(bytes);

  while (size >= 1024 && unitIndex < 4) {
    size /= 1024;
    unitIndex++;
  }

  stringstream ss;
  ss << fixed << setprecision(2) << size << " " << units[unitIndex];
  return ss.str();
}

string toLowercase(const string &str) {
  string result = str;
  transform(result.begin(), result.end(), result.begin(), ::tolower);
  return result;
}

bool validatePath(const fs::path &path) {
  string pathStr = path.string();
  if (pathStr.find("..") != string::npos) {
    return false; // Prevent directory traversal
  }
  return true;
}

// ============================================================================
// Entropy Calculation
// ============================================================================
double calculateEntropy(const vector<unsigned char> &bytes) {
  if (bytes.empty())
    return 0.0;

  array<int, 256> freq{};
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
// Core Detection Function (Thread-safe)
// ============================================================================
FileInfo analyzeFile(const fs::path &filePath) {
  FileInfo info;
  info.path = filePath.string();
  info.name = filePath.filename().string();
  info.isCorrupt = false;
  info.extensionMismatch = false;
  info.type = "Unknown";
  info.category = "Unknown";
  info.description = "Unrecognized file type";
  info.entropy = 0.0;
  info.hash = "";

  if (!validatePath(filePath)) {
    info.type = "Error";
    info.description = "Invalid file path (security check failed)";
    return info;
  }

  auto startTime = high_resolution_clock::now();

  try {
    info.size = fs::file_size(filePath);
  } catch (...) {
    info.size = 0;
  }

  info.actualExtension = toLowercase(filePath.extension().string());

  ifstream file(filePath, ios::binary);
  if (!file) {
    info.type = "Unreadable";
    info.description = "Could not open file";
    return info;
  }

  // Read bytes for analysis
  size_t readSize = min(static_cast<uintmax_t>(65536), info.size);
  vector<unsigned char> buffer(readSize);
  file.read(reinterpret_cast<char *>(buffer.data()), buffer.size());
  streamsize bytesRead = file.gcount();

  if (bytesRead < 2) {
    info.isCorrupt = true;
    info.type = "Empty/Corrupt";
    info.description = "File too small to identify";
    return info;
  }

  buffer.resize(bytesRead);

  // Calculate entropy
  info.entropy = calculateEntropy(buffer);

  // Get hex for magic matching (first 64 bytes)
  string hex = bytesToHex(vector<unsigned char>(
      buffer.begin(), buffer.begin() + min<size_t>(64, bytesRead)));

  // Try to match against magic database
  for (const auto &sig : magicDatabase) {
    string pattern = sig.hex;

    // Handle patterns with wildcards (....)
    if (pattern.find("....") != string::npos) {
      size_t wildcardPos = pattern.find("....");
      if (hex.size() >= pattern.size()) {
        string checkPattern = pattern.substr(0, wildcardPos) +
                              hex.substr(wildcardPos, 4) +
                              pattern.substr(wildcardPos + 4);
        if (hex.substr(0, checkPattern.size()) == checkPattern) {
          info.type = sig.type;
          info.category = sig.category;
          info.description = sig.description;
          break;
        }
      }
    } else {
      if (hex.size() >= pattern.size() &&
          hex.substr(0, pattern.size()) == pattern) {
        info.type = sig.type;
        info.category = sig.category;
        info.description = sig.description;
        break;
      }
    }
  }

  // Fallback for text files
  if (info.type == "Unknown") {
    if (info.actualExtension == ".txt" || info.actualExtension == ".log" ||
        info.actualExtension == ".md" || info.actualExtension == ".csv" ||
        info.actualExtension == ".cfg" || info.actualExtension == ".ini") {
      info.type = "Text";
      info.category = "Text";
      info.description = "Plain text file";
    } else if (info.actualExtension == ".cpp" || info.actualExtension == ".c" ||
               info.actualExtension == ".h" || info.actualExtension == ".hpp") {
      info.type = "Source Code";
      info.category = "Code";
      info.description = "C/C++ source file";
    } else if (info.actualExtension == ".py") {
      info.type = "Python";
      info.category = "Code";
      info.description = "Python script";
    } else if (info.actualExtension == ".js") {
      info.type = "JavaScript";
      info.category = "Code";
      info.description = "JavaScript file";
    } else if (info.actualExtension == ".java") {
      info.type = "Java";
      info.category = "Code";
      info.description = "Java source file";
    } else if (info.actualExtension == ".html" ||
               info.actualExtension == ".htm") {
      info.type = "HTML";
      info.category = "Web";
      info.description = "HTML document";
    } else if (info.actualExtension == ".css") {
      info.type = "CSS";
      info.category = "Web";
      info.description = "Cascading Style Sheet";
    }
  }

  // Check for extension mismatch
  if (info.type != "Unknown" && info.type != "Text" &&
      !info.actualExtension.empty()) {
    string expectedExts = toLowercase(info.type);
    map<string, vector<string>> validExtensions = {
        {"png", {".png"}},
        {"jpeg", {".jpg", ".jpeg"}},
        {"gif", {".gif"}},
        {"bmp", {".bmp"}},
        {"pdf", {".pdf"}},
        {"zip/docx/xlsx",
         {".zip", ".docx", ".xlsx", ".pptx", ".odt", ".jar", ".apk"}},
        {"zip", {".zip", ".jar", ".apk"}},
        {"rar", {".rar"}},
        {"7z", {".7z"}},
        {"mp3", {".mp3"}},
        {"mp4", {".mp4", ".m4v"}},
        {"mkv/webm", {".mkv", ".webm"}},
        {"exe/dll", {".exe", ".dll", ".sys"}},
        {"doc/xls/ppt", {".doc", ".xls", ".ppt"}},
    };

    string lowerType = toLowercase(info.type);
    if (validExtensions.count(lowerType)) {
      auto &valid = validExtensions[lowerType];
      if (find(valid.begin(), valid.end(), info.actualExtension) ==
          valid.end()) {
        info.extensionMismatch = true;
        info.detectedExtension = valid[0];
      }
    }
  }

  auto endTime = high_resolution_clock::now();
  info.analysisTime =
      static_cast<double>(
          duration_cast<microseconds>(endTime - startTime).count()) /
      1000.0;

  return info;
}

// ============================================================================
// Multi-threaded File Analysis
// ============================================================================
vector<FileInfo> analyzeFilesParallel(const vector<fs::path> &filePaths,
                                      ProgressTracker &progress,
                                      bool showProgress) {
  vector<FileInfo> results(filePaths.size());
  progress.setTotal(filePaths.size());

  // Determine thread count (use hardware threads, max 8)
  unsigned int threadCount = min(thread::hardware_concurrency(), 8u);
  if (threadCount == 0)
    threadCount = 4;

  // Chunk files for parallel processing
  vector<future<void>> futures;
  size_t chunkSize = max<size_t>(1, filePaths.size() / threadCount);

  for (size_t i = 0; i < filePaths.size(); i += chunkSize) {
    size_t end = min(i + chunkSize, filePaths.size());

    futures.push_back(async(launch::async, [&, i, end]() {
      for (size_t j = i; j < end; j++) {
        results[j] = analyzeFile(filePaths[j]);
        progress.update(results[j].name);
      }
    }));
  }

  // Wait for all threads with progress display
  if (showProgress) {
    while (true) {
      auto [current, total, fileName] = progress.getProgress();
      if (current >= total)
        break;

      const int barWidth = 40;
      float progressPct =
          static_cast<float>(current) / static_cast<float>(total);
      int pos = static_cast<int>(barWidth * progressPct);

      cout << "\r" << CYAN << "Progress: " << RESET << setw(3)
           << static_cast<int>(progressPct * 100) << "% [";
      for (int k = 0; k < barWidth; ++k) {
        if (k < pos)
          cout << GREEN << "█" << RESET;
        else
          cout << "░";
      }
      cout << "] " << current << "/" << total << " ";

      string shortName = fileName.substr(0, 30);
      if (fileName.length() > 30)
        shortName += "...";
      cout << shortName << "        ";
      cout.flush();

      this_thread::sleep_for(milliseconds(50));
    }
  }

  // Wait for all threads to complete
  for (auto &f : futures) {
    f.wait();
  }

  return results;
}

// ============================================================================
// Progress Bar
// ============================================================================
void showProgressBar(size_t current, size_t total, const string &fileName) {
  const int barWidth = 40;
  float progress = static_cast<float>(current) / static_cast<float>(total);
  int pos = static_cast<int>(barWidth * progress);

  cout << "\r" << CYAN << "Progress: " << RESET << setw(3)
       << static_cast<int>(progress * 100) << "% [";
  for (int i = 0; i < barWidth; ++i) {
    if (i < pos)
      cout << GREEN << "█" << RESET;
    else
      cout << "░";
  }
  cout << "] " << current << "/" << total << " " << fileName.substr(0, 30);
  if (fileName.length() > 30)
    cout << "...";
  cout << "        ";
  cout.flush();
}

// ============================================================================
// JSON Output
// ============================================================================
string escapeJson(const string &s) {
  string result;
  for (char c : s) {
    switch (c) {
    case '"':
      result += "\\\"";
      break;
    case '\\':
      result += "\\\\";
      break;
    case '\n':
      result += "\\n";
      break;
    case '\r':
      result += "\\r";
      break;
    case '\t':
      result += "\\t";
      break;
    default:
      result += c;
    }
  }
  return result;
}

void outputJson(const vector<FileInfo> &files, double totalTime,
                unsigned int threadCount) {
  cout << "{\n";
  cout << "  \"totalFiles\": " << files.size() << ",\n";
  cout << "  \"totalTime\": " << fixed << setprecision(2) << totalTime << ",\n";
  cout << "  \"threadsUsed\": " << threadCount << ",\n";

  // Calculate statistics
  map<string, int> typeCounts;
  map<string, uintmax_t> typeSizes;
  int corruptCount = 0, mismatchCount = 0, encryptedCount = 0;
  uintmax_t totalSize = 0;

  for (const auto &f : files) {
    typeCounts[f.type]++;
    typeSizes[f.type] += f.size;
    totalSize += f.size;
    if (f.isCorrupt)
      corruptCount++;
    if (f.extensionMismatch)
      mismatchCount++;
    if (f.entropy >= 7.5)
      encryptedCount++;
  }

  cout << "  \"totalSize\": " << totalSize << ",\n";
  cout << "  \"totalSizeFormatted\": \"" << formatSize(totalSize) << "\",\n";
  cout << "  \"corruptFiles\": " << corruptCount << ",\n";
  cout << "  \"mismatchedFiles\": " << mismatchCount << ",\n";
  cout << "  \"encryptedFiles\": " << encryptedCount << ",\n";

  // Type statistics
  cout << "  \"statistics\": [\n";
  bool first = true;
  for (const auto &[type, count] : typeCounts) {
    if (!first)
      cout << ",\n";
    first = false;
    cout << "    {\"type\": \"" << escapeJson(type)
         << "\", \"count\": " << count << ", \"size\": " << typeSizes[type]
         << ", \"sizeFormatted\": \"" << formatSize(typeSizes[type]) << "\"}";
  }
  cout << "\n  ],\n";

  // File details
  cout << "  \"files\": [\n";
  first = true;
  for (const auto &f : files) {
    if (!first)
      cout << ",\n";
    first = false;
    cout << "    {\n";
    cout << "      \"name\": \"" << escapeJson(f.name) << "\",\n";
    cout << "      \"path\": \"" << escapeJson(f.path) << "\",\n";
    cout << "      \"type\": \"" << escapeJson(f.type) << "\",\n";
    cout << "      \"category\": \"" << escapeJson(f.category) << "\",\n";
    cout << "      \"description\": \"" << escapeJson(f.description) << "\",\n";
    cout << "      \"size\": " << f.size << ",\n";
    cout << "      \"sizeFormatted\": \"" << formatSize(f.size) << "\",\n";
    cout << "      \"entropy\": " << fixed << setprecision(4) << f.entropy
         << ",\n";
    cout << "      \"isCorrupt\": " << (f.isCorrupt ? "true" : "false")
         << ",\n";
    cout << "      \"extensionMismatch\": "
         << (f.extensionMismatch ? "true" : "false") << ",\n";
    cout << "      \"isEncrypted\": " << (f.entropy >= 7.5 ? "true" : "false")
         << ",\n";
    cout << "      \"actualExtension\": \"" << escapeJson(f.actualExtension)
         << "\",\n";
    cout << "      \"analysisTime\": " << fixed << setprecision(2)
         << f.analysisTime << "\n";
    cout << "    }";
  }
  cout << "\n  ]\n";
  cout << "}\n";
}

// ============================================================================
// Terminal Output
// ============================================================================
void outputTerminal(const vector<FileInfo> &files, double totalTime,
                    bool organize, const fs::path &outputDir,
                    unsigned int threadCount) {
  cout << "\n\n";
  cout << CYAN
       << "╔══════════════════════════════════════════════════════════════╗\n";
  cout << "║" << BOLD
       << "         FileTypeAnalyzer Pro - Analysis Complete            "
       << RESET << CYAN << "║\n";
  cout << "╚══════════════════════════════════════════════════════════════╝"
       << RESET << "\n\n";

  // Sort by size
  vector<FileInfo> sorted = files;
  sort(sorted.begin(), sorted.end(),
       [](const FileInfo &a, const FileInfo &b) { return a.size > b.size; });

  // Detailed results
  cout << YELLOW
       << "┌─ Detailed Analysis Results ─────────────────────────────────────┐"
       << RESET << "\n";
  cout << BOLD
       << " File Name                           │ Type           │ Size       "
          "│ Entropy │ Status"
       << RESET << "\n";
  cout << "─────────────────────────────────────┼────────────────┼────────────┼"
          "─────────┼──────────\n";

  for (const auto &f : sorted) {
    string name = f.name.length() > 35 ? f.name.substr(0, 32) + "..." : f.name;
    string type = f.type.length() > 14 ? f.type.substr(0, 11) + "..." : f.type;

    cout << " " << setw(36) << left << name << "│ " << setw(15) << left << type
         << "│ " << setw(11) << left << formatSize(f.size) << "│ " << fixed
         << setprecision(2) << setw(7) << f.entropy << " │ ";

    if (f.isCorrupt) {
      cout << RED << "⚠ CORRUPT" << RESET;
    } else if (f.extensionMismatch) {
      cout << YELLOW << "⚠ MISMATCH" << RESET;
    } else if (f.entropy >= 7.5) {
      cout << BLUE << "🔐 ENCRYPTED" << RESET;
    } else {
      cout << GREEN << "✓ OK" << RESET;
    }
    cout << "\n";
  }
  cout << YELLOW
       << "└──────────────────────────────────────────────────────────────────┘"
       << RESET << "\n\n";

  // Statistics
  map<string, int> typeCounts;
  map<string, uintmax_t> typeSizes;
  int corruptCount = 0, mismatchCount = 0, encryptedCount = 0;
  uintmax_t totalSize = 0;

  for (const auto &f : files) {
    typeCounts[f.type]++;
    typeSizes[f.type] += f.size;
    totalSize += f.size;
    if (f.isCorrupt)
      corruptCount++;
    if (f.extensionMismatch)
      mismatchCount++;
    if (f.entropy >= 7.5)
      encryptedCount++;
  }

  cout << MAGENTA
       << "┌─ File Type Distribution ─────────────────────────────────────────┐"
       << RESET << "\n";
  for (const auto &[type, count] : typeCounts) {
    int barLen = min(count * 2, 30);
    cout << " " << setw(18) << left << type << " │ ";
    cout << GREEN;
    for (int i = 0; i < barLen; i++)
      cout << "█";
    cout << RESET << " " << count << " files (" << formatSize(typeSizes[type])
         << ")\n";
  }
  cout << MAGENTA
       << "└──────────────────────────────────────────────────────────────────┘"
       << RESET << "\n\n";

  // Summary
  cout << BLUE
       << "┌─ Analysis Summary ───────────────────────────────────────────────┐"
       << RESET << "\n";
  cout << " │ Total files analyzed: " << BOLD << files.size() << RESET << "\n";
  cout << " │ Total size: " << BOLD << formatSize(totalSize) << RESET << "\n";
  cout << " │ Unique file types: " << BOLD << typeCounts.size() << RESET
       << "\n";
  cout << " │ Threads used: " << BOLD << threadCount << RESET << "\n";
  cout << " │ Analysis time: " << BOLD << fixed << setprecision(2) << totalTime
       << "s" << RESET << "\n";
  if (corruptCount > 0)
    cout << " │ " << RED << "Corrupt files: " << corruptCount << RESET << "\n";
  if (mismatchCount > 0)
    cout << " │ " << YELLOW << "Extension mismatches: " << mismatchCount
         << RESET << "\n";
  if (encryptedCount > 0)
    cout << " │ " << BLUE << "Encrypted/Compressed files: " << encryptedCount
         << RESET << "\n";
  if (organize)
    cout << " │ Files organized to: " << CYAN << outputDir.string() << RESET
         << "\n";
  cout << BLUE
       << "└──────────────────────────────────────────────────────────────────┘"
       << RESET << "\n";
}

// ============================================================================
// Main Function
// ============================================================================
int main(int argc, char *argv[]) {
  enableVirtualTerminal();

  // Parse command line arguments
  bool jsonOutput = false;
  bool recursive = false;
  bool organize = false;
  bool parallel = true; // Default to parallel
  string inputPath;
  string customSigPath;

  for (int i = 1; i < argc; i++) {
    string arg = argv[i];
    if (arg == "--json" || arg == "-j") {
      jsonOutput = true;
    } else if (arg == "--recursive" || arg == "-r") {
      recursive = true;
    } else if (arg == "--organize" || arg == "-o") {
      organize = true;
    } else if (arg == "--sequential" || arg == "-s") {
      parallel = false;
    } else if (arg == "--signatures" || arg == "-S") {
      if (i + 1 < argc) {
        customSigPath = argv[++i];
      }
    } else if (arg == "--help" || arg == "-h") {
      cout << "FileTypeAnalyzer Pro v3.0 - Magic Number Based File "
              "Detection\n\n";
      cout << "Usage: " << argv[0] << " [options] <directory_path>\n\n";
      cout << "Options:\n";
      cout << "  -j, --json         Output results as JSON\n";
      cout << "  -r, --recursive    Scan subdirectories\n";
      cout << "  -o, --organize     Organize files into type-based folders\n";
      cout << "  -s, --sequential   Disable multi-threading\n";
      cout << "  -S, --signatures   Load custom signatures from JSON file\n";
      cout << "  -h, --help         Show this help message\n\n";
      cout << "Examples:\n";
      cout << "  " << argv[0] << " ./downloads\n";
      cout << "  " << argv[0] << " --json ./documents\n";
      cout << "  " << argv[0] << " -r -o ./mixed_files\n";
      cout << "  " << argv[0] << " -S custom_sigs.json ./files\n";
      return 0;
    } else if (inputPath.empty()) {
      inputPath = arg;
    }
  }

  // Load custom signatures if specified
  if (!customSigPath.empty()) {
    if (loadCustomSignatures(customSigPath)) {
      if (!jsonOutput) {
        cout << GREEN << "Loaded custom signatures from: " << customSigPath
             << RESET << "\n";
      }
    } else {
      if (!jsonOutput) {
        cout << YELLOW << "Warning: Could not load custom signatures from: "
             << customSigPath << RESET << "\n";
      }
    }
  }

  if (inputPath.empty()) {
    if (!jsonOutput) {
      cout << RED << "Error: No directory specified.\n" << RESET;
      cout << "Usage: " << argv[0] << " [options] <directory_path>\n";
      cout << "Use --help for more information.\n";
#ifdef _WIN32
      system("pause");
#endif
    } else {
      cout << "{\"error\": \"No directory specified\"}\n";
    }
    return 1;
  }

  fs::path inputDir = inputPath;
  if (!fs::exists(inputDir)) {
    if (!jsonOutput) {
      cout << RED << "Error: Path does not exist: " << inputDir << RESET
           << "\n";
    } else {
      cout << "{\"error\": \"Path does not exist\"}\n";
    }
    return 1;
  }

  // Collect files
  vector<fs::path> filePaths;

  try {
    if (fs::is_regular_file(inputDir)) {
      filePaths.push_back(inputDir);
    } else if (fs::is_directory(inputDir)) {
      if (recursive) {
        for (const auto &entry : fs::recursive_directory_iterator(inputDir)) {
          if (fs::is_regular_file(entry)) {
            filePaths.push_back(entry.path());
          }
        }
      } else {
        for (const auto &entry : fs::directory_iterator(inputDir)) {
          if (fs::is_regular_file(entry)) {
            filePaths.push_back(entry.path());
          }
        }
      }
    }
  } catch (const fs::filesystem_error &e) {
    if (!jsonOutput) {
      cout << RED << "Error reading directory: " << e.what() << RESET << "\n";
    } else {
      cout << "{\"error\": \"" << escapeJson(e.what()) << "\"}\n";
    }
    return 1;
  }

  if (filePaths.empty()) {
    if (!jsonOutput) {
      cout << YELLOW << "No files found to analyze." << RESET << "\n";
    } else {
      cout << "{\"error\": \"No files found\", \"files\": []}\n";
    }
    return 0;
  }

  // Determine thread count
  unsigned int threadCount =
      parallel ? min(thread::hardware_concurrency(), 8u) : 1;
  if (threadCount == 0)
    threadCount = 4;

  // Header (terminal only)
  if (!jsonOutput) {
    cout << "\n";
    cout
        << CYAN
        << "╔══════════════════════════════════════════════════════════════╗\n";
    cout << "║" << BOLD
         << "              FileTypeAnalyzer Pro v3.0                       "
         << RESET << CYAN << "║\n";
    cout << "║"
         << "       Magic Number Based File Type Detection                 "
         << "║\n";
    cout
        << "╠══════════════════════════════════════════════════════════════╣\n";
    cout << "║"
         << " Features: 50+ file types | Multi-threaded | Entropy analysis "
         << "║\n";
    cout << "║"
         << "           Custom signatures | Extension mismatch detection  "
         << "║\n";
    cout << "╚══════════════════════════════════════════════════════════════╝"
         << RESET << "\n\n";

    cout << BLUE << "Directory: " << RESET << inputDir.string() << "\n";
    cout << BLUE << "Mode: " << RESET
         << (recursive ? "Recursive" : "Non-recursive") << "\n";
    cout << BLUE << "Threads: " << RESET << threadCount << "\n";
    cout << BLUE << "Files found: " << RESET << filePaths.size() << "\n\n";
  }

  // Analyze files
  auto startTime = high_resolution_clock::now();
  vector<FileInfo> results;
  fs::path outputBase = inputDir / "OrganizedFiles";

  if (parallel && filePaths.size() > 10) {
    // Use multi-threaded analysis
    ProgressTracker progress;
    results = analyzeFilesParallel(filePaths, progress, !jsonOutput);
  } else {
    // Sequential analysis for small sets
    for (size_t i = 0; i < filePaths.size(); i++) {
      FileInfo info = analyzeFile(filePaths[i]);
      results.push_back(info);
      if (!jsonOutput) {
        showProgressBar(i + 1, filePaths.size(), info.name);
      }
    }
  }

  // Organize if requested
  if (organize) {
    for (const auto &info : results) {
      if (info.type != "Unknown" && info.type != "Unreadable") {
        try {
          fs::path typeDir = outputBase / info.type;
          fs::path destFile = typeDir / info.name;
          if (fs::exists(destFile))
            fs::remove(destFile);
          fs::create_directories(typeDir);
          fs::copy_file(info.path, destFile);
        } catch (...) {
          // Silently continue if copy fails
        }
      }
    }
  }

  auto endTime = high_resolution_clock::now();
  double totalTime =
      duration_cast<duration<double>>(endTime - startTime).count();

  // Output results
  if (jsonOutput) {
    outputJson(results, totalTime, threadCount);
  } else {
    outputTerminal(results, totalTime, organize, outputBase, threadCount);
    cout << "\nPress Enter to exit...";
    cin.get();
  }

  return 0;
}
