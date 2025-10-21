"""
IdeaMine Tools CLI - Setup
"""

from setuptools import setup, find_packages

setup(
    name="ideamine-tools",
    version="1.0.0",
    description="CLI for IdeaMine Tools development, testing, and publishing",
    author="IdeaMine Team",
    author_email="tools@ideamine.dev",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    python_requires=">=3.8",
    install_requires=[
        "click>=8.0.0",
        "pyyaml>=6.0.0",
        "httpx>=0.24.0",
    ],
    entry_points={
        "console_scripts": [
            "ideamine-tools=cli:cli",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
)
