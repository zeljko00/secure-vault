import argparse

from pypdf import PdfReader


def main():
    parser = argparse.ArgumentParser(description="Extract text from a PDF file.")
    parser.add_argument("pdf", help="Path to the input PDF file")
    parser.add_argument("out", help="Path to the output text file", default="output.txt")
    args = parser.parse_args()

    reader = PdfReader(args.pdf)
    with open(args.out, "w", encoding="utf-8") as f:
        for page in reader.pages:
            text = page.extract_text()
            if text:
                f.write(text + "\n")


if __name__ == "__main__":
    main()