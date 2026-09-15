"""Bounded content validation, NOT malware scanning or permission to send."""
from pathlib import Path
import zipfile

MAX_EXTRA_BYTES = 15 * 1024 * 1024
ALLOWED = {'.pdf', '.png', '.jpg', '.jpeg', '.webp', '.docx', '.xlsx', '.txt'}


def validate_attachment(path: Path, suffix: str | None = None) -> None:
    kind = (suffix or path.suffix).lower()
    if path.is_symlink() or not path.is_file() or kind not in ALLOWED:
        raise ValueError('Choose a regular supported attachment; links, executables and archives are not allowed.')
    if not 0 < path.stat().st_size <= MAX_EXTRA_BYTES:
        raise ValueError('Attachment must be nonempty and no larger than 15 MB.')
    with path.open('rb') as source:
        header = source.read(16)
    if header.startswith((b'MZ', b'\x7fELF', b'#!')):
        raise ValueError('Executable content is not a customer attachment.')
    if kind == '.pdf':
        if not header.startswith(b'%PDF-'):
            raise ValueError('PDF content does not match its filename.')
    elif kind in {'.png', '.jpg', '.jpeg', '.webp'}:
        from PIL import Image
        expected = {'.png': 'PNG', '.jpg': 'JPEG', '.jpeg': 'JPEG', '.webp': 'WEBP'}[kind]
        try:
            with Image.open(path) as image:
                if image.format != expected or image.width * image.height > 40_000_000:
                    raise ValueError('Image format or dimensions are invalid.')
                image.verify()
        except Exception:
            raise ValueError('Image content is invalid or does not match its filename.') from None
    elif kind in {'.docx', '.xlsx'}:
        try:
            with zipfile.ZipFile(path) as archive:
                entries = archive.infolist()
                names = {entry.filename for entry in entries}
                required = 'word/document.xml' if kind == '.docx' else 'xl/workbook.xml'
                if len(entries) > 2000 or required not in names or '[Content_Types].xml' not in names:
                    raise ValueError('Not a supported Office document.')
                if sum(entry.file_size for entry in entries) > 60 * 1024 * 1024:
                    raise ValueError('Office document expands beyond the safety limit.')
                for entry in entries:
                    name = entry.filename.lower()
                    if '..' in name.split('/') or name.startswith('/') or '\\' in name or entry.flag_bits & 1:
                        raise ValueError('Unsafe Office container.')
                    if any(value in name for value in ('vbaproject', 'embeddings/', 'externallinks/')):
                        raise ValueError('Macros, embedded objects and external workbooks are not allowed.')
                if archive.testzip() is not None:
                    raise ValueError('Damaged Office document.')
        except (zipfile.BadZipFile, RuntimeError):
            raise ValueError('Invalid Office attachment.') from None
    else:
        try:
            data = path.read_text(encoding='utf-8-sig')
        except UnicodeError:
            raise ValueError('Text attachments must contain UTF-8 text.') from None
        if any(ord(char) < 32 and char not in '\n\r\t' for char in data):
            raise ValueError('Binary content is not a text attachment.')
