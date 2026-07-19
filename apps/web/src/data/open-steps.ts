// Renders on /open-account AND feeds the HowTo structured data and
// llms-full.txt — one source, no drift.
export const openAccountSteps = [
  {
    name: 'Confirm your child is eligible',
    text: 'Your child needs a valid Social Security number and U.S. citizenship, and must be under 18. If they were born January 1, 2025 – December 31, 2028, they also qualify for the one-time $1,000 federal seed. Have their SSN and date of birth handy.',
  },
  {
    name: 'Gather what you’ll need',
    text: 'Typically: your identity verification (the IRS uses ID.me), your child’s SSN and birth information, and a bank account or funding source for contributions. Setting up an IRS online account in advance makes the election smoother.',
  },
  {
    name: 'Elect the account',
    text: 'Open the account by completing IRS Form 4547 through your IRS account, or start at the official portal, trumpaccounts.gov. This is where the account is formally created and the seed (if eligible) is applied.',
  },
  {
    name: 'Choose a low-cost eligible fund',
    text: 'By law, 530A money must be invested in funds that track an index of primarily U.S. companies with a low, capped expense ratio. See our Resources page for a starter list. Lower fees mean more of the growth stays in your child’s account.',
  },
  {
    name: 'Set up contributions',
    text: 'Add a one-time gift, a recurring monthly amount, or both — up to the $5,000/year combined limit across all contributors (employers max $2,500). Automating even $50–$100/month is where most of the long-term growth comes from. Invite grandparents to chip in toward the same limit.',
  },
  {
    name: 'Set it and let it compound',
    text: 'No withdrawals are allowed until the year your child turns 18, so the best thing you can do is leave it alone and let time work. Revisit once a year to adjust contributions. When your child turns 18, walk them through what they’ve been given — and the Roth conversion option.',
  },
]
