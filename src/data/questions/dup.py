import json

def check_duplicate_ids(filename):
    """
    Check for duplicate IDs in a given JSON file.

    Parameters:
    - filename (str): The name of the JSON file.

    Returns:
    - list: A list of duplicate IDs if any.
    """
    with open(filename, 'r') as file:
        data = json.load(file)

    seen_ids = set()
    duplicate_ids = []

    for item in data:
        if isinstance(item, dict) and "id" in item:
            if item["id"] in seen_ids:
                duplicate_ids.append(item["id"])
            seen_ids.add(item["id"])

    return duplicate_ids

if __name__ == "__main__":
    filename = input("Enter the JSON filename: ")
    duplicates = check_duplicate_ids(filename)

    if duplicates:
        print("Found duplicate IDs:", duplicates)
    else:
        print("No duplicate IDs found in the file.")
