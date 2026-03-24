"""R2 へのファイルアップロードスクリプト"""
import sys
import os
import boto3
from pathlib import Path

def upload(file_path: str):
    path = Path(file_path)
    s3 = boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    key = f"reports/{path.name}"
    s3.upload_file(
        str(path),
        os.environ["R2_BUCKET"],
        key,
        ExtraArgs={"ContentType": "text/html"},
    )
    print(f"Uploaded: {key}")

if __name__ == "__main__":
    upload(sys.argv[1])
