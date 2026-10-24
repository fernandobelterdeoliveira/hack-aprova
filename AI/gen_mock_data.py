import asyncio
import os
import sys
from datetime import datetime, timedelta
import random
import json
from typing import List, Dict
from urllib.parse import unquote

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncpg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')

CASE_TYPES = [
    "Personal Injury - Car Accident",
    "Personal Injury - Slip and Fall",
    "Workers Compensation",
    "Medical Malpractice",
    "Product Liability",
    "Wrongful Death",
    "Dog Bite Injury",
    "Premises Liability"
]

CLIENT_NAMES = [
    "Sarah Johnson", "Michael Chen", "Emma Rodriguez", "David Williams",
    "Lisa Thompson", "James Martinez", "Amanda Davis", "Robert Garcia",
    "Jennifer Lee", "Christopher Brown", "Maria Gonzalez", "William Taylor"
]

CLIENT_DOBS = [
    "1985-05-12", "1990-08-23", "1978-11-15", "1982-03-07",
    "1995-09-30", "1988-12-18", "1975-06-25", "1992-04-11"
]

PHONE_NUMBERS = [
    "(555) 123-4567", "(555) 234-5678", "(555) 345-6789", "(555) 456-7890",
    "(555) 567-8901", "(555) 678-9012", "(555) 789-0123", "(555) 890-1234"
]

PRIORITIES = ["low", "medium", "high", "urgent"]
STATUSES = ["open", "in_progress", "pending", "on-hold"]

def get_random_size():
    size_kb = random.randint(50, 5000)
    if size_kb > 1000:
        return f"{size_kb / 1000:.1f} MB"
    else:
        return f"{size_kb} KB"

def get_file_type(extension):
    ext = extension.lower()
    if ext in ['.pdf']:
        return 'pdf'
    if ext in ['.jpg', '.jpeg', '.png', '.gif']:
        return 'image'
    if ext in ['.m4a', '.mp3', '.wav']:
        return 'audio'
    if ext in ['.docx', '.xlsx', '.csv', '.txt']:
        return 'document'
    if ext in ['.zip']:
        return 'zip'
    return 'file'

RAW_URLS = [
    "https://simplylaw.s3.us-east-1.amazonaws.com/BI+CARRIER+requesting+info_Redacted.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/EST-TOTALLOSS--14593-84-04-15-2019-16-18-02_Redacted.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/Property+damage+estimate_Redacted.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/EST-PHOTOS-04-15-2019_Redacted.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/Ltr+from+AutoOwners+with+offer+of+%2418k_Redacted.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/File+4-+low+offer-+lawsuit.m4a",
    "https://simplylaw.s3.us-east-1.amazonaws.com/File+4-+call+about+demand.m4a",
    "https://simplylaw.s3.us-east-1.amazonaws.com/PIP+LOG+as+of+2_14_2020_Redacted.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/POLICE+REPORT+(1).pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/Fie+4-+3rd+call.m4a",
    "https://simplylaw.s3.us-east-1.amazonaws.com/File+4+-+first+call.m4a",
    "https://simplylaw.s3.us-east-1.amazonaws.com/File+4-+2nd+call.m4a",
    "https://simplylaw.s3.us-east-1.amazonaws.com/File+4-4th+call.m4a",
    "https://simplylaw.s3.us-east-1.amazonaws.com/File+Notes.docx",
    "https://simplylaw.s3.us-east-1.amazonaws.com/Insurance+Basics.docx",
    "https://simplylaw.s3.us-east-1.amazonaws.com/LIEN+-+MEDICARE+(2)_Redacted.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/LIEN+-OPTUM+FINAL+LIEN+_Redacted.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/Police+Report.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/INSURANCE-+POLICY+PROGRESSIVE++.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/LIEN+-+MEDICARE+(1)_Redacted.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/LIEN+-+OPTUM+_Redacted.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/Progressive+Dec_Redacted.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/Geico+Dec+Page_Redacted.PDF",
    "https://simplylaw.s3.us-east-1.amazonaws.com/Geico+Policy_Redacted.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/LTR+-+OFFER+28k+asking+for+sx+recoreds.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/VM+from+Geico+.wav",
    "https://simplylaw.s3.us-east-1.amazonaws.com/LTR+-+CRN+TO+PROGRESSIVE+.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/LTR+-+OFFER-+24k+again.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/LTR+-+OFFER+28K++.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/ltr+-+offer+22%2C---.PDF",
    "https://simplylaw.s3.us-east-1.amazonaws.com/LTR+-+OFFER+24K.PDF",
    "https://simplylaw.s3.us-east-1.amazonaws.com/LTR+-+OFFER-25k.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/ltr+-+offer+.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/PD+-+EST-ESTIMATE--10394-07-08-03-2021-16-13-37_Redacted.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/PD+-+EST-PHOTOS1.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/PD+-+EST-PHOTOS.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/PD1.jpg",
    "https://simplylaw.s3.us-east-1.amazonaws.com/PD%40.jpg",
    "https://simplylaw.s3.us-east-1.amazonaws.com/Scene1.jpg",
    "https://simplylaw.s3.us-east-1.amazonaws.com/Scene2.jpg",
    "https://simplylaw.s3.us-east-1.amazonaws.com/File+3-+5+days+after+demand.m4a",
    "https://simplylaw.s3.us-east-1.amazonaws.com/File+3-+call+about+Tender.m4a",
    "https://simplylaw.s3.us-east-1.amazonaws.com/File+3-+call+about+demand.m4a",
    "https://simplylaw.s3.us-east-1.amazonaws.com/File+3-+call+about+offer.m4a",
    "https://simplylaw.s3.us-east-1.amazonaws.com/File+3-+call+about+CRN.m4a",
    "https://simplylaw.s3.us-east-1.amazonaws.com/File+3-+first+call.m4a",
    "https://simplylaw.s3.us-east-1.amazonaws.com/File+3+-+2nd+call.m4a",
    "https://simplylaw.s3.us-east-1.amazonaws.com/File+3+-+3rd+call.m4a",
    "https://simplylaw.s3.us-east-1.amazonaws.com/PIP+LOG+_Redacted.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/File+3-+4th+call.m4a",
    "https://simplylaw.s3.us-east-1.amazonaws.com/LTR+-+PIP+EXHAUST.PDF",
    "https://simplylaw.s3.us-east-1.amazonaws.com/CRASH+REPORT.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/PIP+payout_Redacted.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/PL+offer_Redacted.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/Property+damage+estimate+and+photos.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/sms_records_anonymized.csv"
]

FILE_TYPES = []
for url in RAW_URLS:
    filename = unquote(url.split('/')[-1])
    _root, extension = os.path.splitext(filename)
    FILE_TYPES.append({
        "name": filename,
        "url": url,
        "type": get_file_type(extension),
        "size": get_random_size()
    })

EMAIL_TEMPLATES = [
    {
        "subject": "Re: My accident claim - medical bills",
        "content": """Hi,

I hope this email finds you well. I just got back from my follow-up appointment with Dr. Anderson and wanted to update you. The pain in my lower back is still pretty bad, especially when I sit for more than 30 minutes. The doctor said I might need physical therapy for another 6-8 weeks.

I'm attaching the bills from my last visit - it was $450 for the consultation and $200 for the X-rays. Also, I haven't heard back from the insurance adjuster since last month. Should I be worried?

Thanks for all your help,
{client_name}""",
        "priority": "medium",
        "files": ["BI CARRIER requesting info_Redacted.pdf", "Property damage estimate_Redacted.pdf"]
    },
    {
        "subject": "Question about settlement offer",
        "content": """Hello,

The insurance company contacted me directly with a settlement offer. I didn't accept anything yet because I remembered you said to talk to you first. The offer is $15,000 but I'm not sure if that's fair given all my medical expenses and lost work time.

Can we schedule a call to discuss this?

Best,
{client_name}""",
        "priority": "high",
        "files": []
    },
]

TEXT_MESSAGE_TEMPLATES = [
    {"text": "hey i know its late but forgot to mention the store manager saw me fall. also my neighbor knows someone who fell there too??", "priority": "medium"},
    {"text": "hi! went to physical therapy today. they said 3x per week for 2 months. will insurance cover this?", "priority": "low"},
    {"text": "URGENT: insurance company called me directly. i didnt answer. what should i do???", "priority": "high"},
]

CHAT_TEMPLATES = [
    {"messages": [
        {"role": "user", "text": "I received an email from insurance offering $100,000 to settle. 30-day deadline. What should I do?"},
        {"role": "assistant", "text": "## Settlement Offer Analysis\n**Priority:** CRITICAL\n**Time Sensitive:** 30 days\n\nI recommend:\n1. Schedule attorney consultation\n2. Review case value vs offer\n3. Compile medical documentation\n\nShall I proceed?"}
    ]},
    {"messages": [
        {"role": "user", "text": "Client uploaded 8 documents - accident photos, bills, texts. Can you organize these?"},
        {"role": "assistant", "text": "## Document Processing\n\n**Medical (3):** Bills and records\n**Evidence (4):** Photos\n**Communications (1):** Text messages\n\nFiles organized and ready for review."}
    ]},
]

CASE_DESCRIPTIONS = [
    "Slip and fall incident at retail location. Client sustained back injuries.",
    "Car accident on I-4, rear-end collision. Multiple injuries including whiplash.",
    "Workers compensation claim for repetitive strain injury.",
    "Medical malpractice during routine surgery. Seeking compensation for additional procedures.",
    "Product liability case involving defective household appliance.",
    "Wrongful death claim following workplace accident.",
    "Dog bite injury requiring emergency medical treatment.",
    "Premises liability - inadequate security leading to assault."
]

NEXT_ACTIONS = [
    "Schedule medical evaluation",
    "Review contract terms",
    "Gather employment records",
    "Awaiting survey results",
    "Prepare court documents",
    "File motion with court",
    "Contact insurance adjuster",
    "Schedule client consultation"
]

async def get_column_names(conn, table_name):
    query = """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = $1
            ORDER BY ordinal_position \
            """
    rows = await conn.fetch(query, table_name)
    return [row['column_name'] for row in rows]

async def create_case_with_data(conn, client_name: str, client_dob: str, case_type: str, case_number: str):
    status = random.choice(STATUSES)
    priority = random.choice(PRIORITIES)
    created_at = datetime.now() - timedelta(days=random.randint(30, 180))

    case_id = await conn.fetchval(
        '''INSERT INTO "Case"
           (id, "caseType", "clientName", "clientDob", "caseNumber", status, priority,
            "assignedTo", description, "nextAction", "createdAt", "lastActivity")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               RETURNING id''',
        case_type,
        client_name,
        client_dob,
        case_number,
        status,
        priority,
        "Emily Rodriguez",
        random.choice(CASE_DESCRIPTIONS),
        random.choice(NEXT_ACTIONS),
        created_at,
        datetime.now()
    )

    num_chats = random.randint(1, 2)
    for i in range(num_chats):
        chat_template = random.choice(CHAT_TEMPLATES)
        chat_id = await conn.fetchval(
            'INSERT INTO "Chat" (id, "caseId") VALUES (gen_random_uuid()::text, $1) RETURNING id',
            case_id
        )
        for msg in chat_template["messages"]:
            await conn.execute(
                'INSERT INTO "Message" (id, role, text, "chatId") VALUES (gen_random_uuid()::text, $1, $2, $3)',
                msg["role"], msg["text"], chat_id
            )

    num_emails = random.randint(2, 4)
    for i in range(num_emails):
        template = random.choice(EMAIL_TEMPLATES)
        subject = template["subject"]
        content = template["content"].format(client_name=client_name)

        await conn.execute(
            '''INSERT INTO "Email"
               (id, "caseId", subject, content, "from", "to", "createdAt", "updatedAt")
               VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)''',
            case_id,
            subject,
            content,
            f"{client_name.lower().replace(' ', '.')}@email.com",
            "emily.rodriguez@lawfirm.com",
            datetime.now() - timedelta(days=random.randint(1, 30)),
            datetime.now()
        )

        for file_name in template.get("files", []):
            file_info = next((f for f in FILE_TYPES if f["name"] == file_name), None)
            if file_info:
                await conn.execute(
                    '''INSERT INTO "Files"
                           (id, "caseId", name, url, type, size, "uploadedAt", "uploadedBy")
                       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)''',
                    case_id,
                    file_info["name"],
                    file_info["url"],
                    file_info["type"],
                    file_info["size"],
                    datetime.now() - timedelta(days=random.randint(1, 20)),
                    "Emily Rodriguez"
                )

    num_texts = random.randint(1, 3)
    for i in range(num_texts):
        text_template = random.choice(TEXT_MESSAGE_TEMPLATES)
        phone = random.choice(PHONE_NUMBERS)

        await conn.execute(
            '''INSERT INTO "TextMessage"
                   (id, "caseId", text, "from", "to", "createdAt", "updatedAt")
               VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)''',
            case_id,
            text_template["text"],
            phone,
            "(555) 000-0000",
            datetime.now() - timedelta(hours=random.randint(1, 72)),
            datetime.now()
        )

    num_extra_files = random.randint(3, 6)
    for i in range(num_extra_files):
        file_info = random.choice(FILE_TYPES)

        await conn.execute(
            '''INSERT INTO "Files"
                   (id, "caseId", name, url, type, size, "uploadedAt", "uploadedBy")
               VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)''',
            case_id,
            file_info["name"],
            file_info["url"],
            file_info["type"],
            file_info["size"],
            datetime.now() - timedelta(days=random.randint(1, 60)),
            "Emily Rodriguez"
        )

    reason_chains = [
        {
            "agentType": "document_classifier",
            "action": "classified_medical_records",
            "reasoning": f"Classified {num_extra_files} documents based on content analysis",
            "confidence": 0.95
        },
        {
            "agentType": "priority_analyzer",
            "action": "flagged_urgent_communication",
            "reasoning": "Settlement offer requires immediate attorney attention",
            "confidence": 0.88
        },
        {
            "agentType": "task_orchestrator",
            "action": "created_follow_up_tasks",
            "reasoning": "Generated tasks based on deadlines",
            "confidence": 0.92
        }
    ]

    for entry in reason_chains:
        await conn.execute(
            '''INSERT INTO "ReasonChain"
               (id, "caseId", "agentType", action, reasoning, confidence, timestamp, data)
               VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)''',
            case_id,
            entry["agentType"],
            entry["action"],
            entry["reasoning"],
            entry["confidence"],
            datetime.now() - timedelta(minutes=random.randint(10, 500)),
            json.dumps({"case_type": case_type})
        )

    return case_id

async def populate_database():
    print("🏛️  Morgan & Morgan AI - Mock Data Generation")
    print("=" * 80)

    if not DATABASE_URL:
        print("❌ ERROR: DATABASE_URL not found")
        return

    try:
        print("\n📊 Connecting to database...")
        conn = await asyncpg.connect(DATABASE_URL, statement_cache_size=0)
        print("✅ Connected")

        print("\n🔍 Checking database schema...")
        case_columns = await get_column_names(conn, "Case")
        print(f"   Case table columns: {', '.join(case_columns)}")

        print("\n🧹 Clearing existing data...")
        for table in ["ReasonChain", "TextMessage", "Files", "Email", "Message", "Chat", "Case"]:
            await conn.execute(f'DELETE FROM "{table}"')
        print("✅ Cleared")

        print("\n📝 Generating cases...")

        case_count = 0
        stats = {"chats": 0, "emails": 0, "files": 0, "texts": 0, "reasons": 0}

        for i, client_name in enumerate(CLIENT_NAMES[:8]):
            case_type = CASE_TYPES[i % len(CASE_TYPES)]
            client_dob = CLIENT_DOBS[i % len(CLIENT_DOBS)]
            case_number = f"CASE-{2025}-{str(i+1).zfill(4)}"

            case_id = await create_case_with_data(conn, client_name, client_dob, case_type, case_number)
            case_count += 1

            for key, table in [
                ("chats", "Chat"),
                ("emails", "Email"),
                ("files", "Files"),
                ("texts", "TextMessage"),
                ("reasons", "ReasonChain")
            ]:
                stats[key] += await conn.fetchval(
                    f'SELECT COUNT(*) FROM "{table}" WHERE "caseId" = $1',
                    case_id
                )

            print(f"  ✓ Case {case_count}: {client_name} - {case_type} ({case_number})")

        await conn.close()

        print("\n" + "=" * 80)
        print(f"✅ SUCCESS! Generated {case_count} cases")
        print(f"\n📋 Summary:")
        print(f"   • {stats['chats']} chats")
        print(f"   • {stats['emails']} emails")
        print(f"   • {stats['files']} files")
        print(f"   • {stats['texts']} text messages")
        print(f"   • {stats['reasons']} reason chains")
        print("\n🤖 Database ready!")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(populate_database())