#!/usr/bin/env python
"""Control hub for managing Django project via command line."""
import os
import sys


def main():
    """Execute Django administrative tasks."""
    # Set the default settings module (config/settings.py).
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Ensure your virtual environment is activated "
            "and Django is installed and available on your PYTHONPATH."
        ) from exc
    # Pass cmd arguments to Django cmd utility
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()
