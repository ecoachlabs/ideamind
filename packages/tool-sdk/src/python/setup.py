"""
IdeaMine Tools SDK - Python
Setup configuration
"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="ideamine-tool-sdk",
    version="1.0.0",
    author="IdeaMine Team",
    author_email="tools@ideamine.dev",
    description="IdeaMine Tools SDK for Python",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/ideamine/tool-sdk",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    python_requires=">=3.10",
    install_requires=[
        "httpx>=0.25.0",
        "jsonschema>=4.20.0",
        "pydantic>=2.5.0",
        "opentelemetry-api>=1.21.0",
        "opentelemetry-sdk>=1.21.0",
        "opentelemetry-exporter-otlp>=1.21.0",
        "pyyaml>=6.0.1",
        "structlog>=23.2.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.3",
            "pytest-asyncio>=0.21.1",
            "pytest-cov>=4.1.0",
            "black>=23.12.0",
            "mypy>=1.7.1",
            "ruff>=0.1.8",
        ],
    },
)
